import { createFileRoute } from "@tanstack/react-router";
import { tgSendMessage } from "@/lib/telegram.server";

const ANON_KEY = "sb_publishable__Y3mmIOkA2ttjtb0QI14Pg_nTbU6194";

function fmt(d: string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export const Route = createFileRoute("/api/public/telegram/notify-anfrage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (apikey !== ANON_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { anfrage_id?: string };
        try {
          body = (await request.json()) as { anfrage_id?: string };
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body?.anfrage_id) {
          return Response.json({ ok: false, error: "anfrage_id missing" }, { status: 400 });
        }

        const { data: anfrage, error: aErr } = await supabaseAdmin
          .from("anfragen")
          .select("id, typ, empfaenger_typ, empfaenger_id, zeitraum_von, zeitraum_bis, status, token, erstellt_am")
          .eq("id", body.anfrage_id)
          .maybeSingle();
        if (aErr || !anfrage) {
          return Response.json({ ok: false, error: aErr?.message ?? "anfrage not found" }, { status: 404 });
        }

        // Empfänger-Name auflösen
        let empfaengerName = "—";
        if (anfrage.empfaenger_typ === "einrichtung") {
          const { data: e } = await supabaseAdmin
            .from("einrichtungen")
            .select("name, ort")
            .eq("id", anfrage.empfaenger_id)
            .maybeSingle();
          if (e) empfaengerName = [e.name, e.ort].filter(Boolean).join(", ");
        } else if (anfrage.empfaenger_typ === "mitarbeiter") {
          const { data: m } = await supabaseAdmin
            .from("mitarbeiter")
            .select("vorname, nachname")
            .eq("id", anfrage.empfaenger_id)
            .maybeSingle();
          if (m) empfaengerName = [m.vorname, m.nachname].filter(Boolean).join(" ");
        }

        const text =
          `🆕 <b>Neue Anfrage</b>\n` +
          `Typ: ${anfrage.typ}\n` +
          `${anfrage.empfaenger_typ === "einrichtung" ? "Kunde" : "Mitarbeiter"}: ${empfaengerName}\n` +
          `Zeitraum: ${fmt(anfrage.zeitraum_von)} – ${fmt(anfrage.zeitraum_bis)}\n` +
          `Status: ${anfrage.status}`;

        const { data: recipients, error: rErr } = await supabaseAdmin
          .from("telegram_notify_recipients")
          .select("chat_id")
          .eq("aktiv", true);
        if (rErr) {
          return Response.json({ ok: false, error: rErr.message }, { status: 500 });
        }
        if (!recipients || recipients.length === 0) {
          return Response.json({ ok: true, sent: 0, note: "no recipients configured" });
        }

        let sent = 0;
        const errors: string[] = [];
        for (const r of recipients) {
          try {
            await tgSendMessage(Number(r.chat_id), text, { parse_mode: "HTML" });
            sent++;
          } catch (err) {
            errors.push(String((err as Error).message ?? err));
          }
        }
        return Response.json({ ok: true, sent, errors });
      },
    },
  },
});
