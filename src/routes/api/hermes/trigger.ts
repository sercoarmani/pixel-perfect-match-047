import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tgSendMessage } from "@/lib/telegram.server";
import { logVersand } from "@/lib/versand-log.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

function publicOrigin(): string {
  const env = process.env.PUBLIC_APP_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  return "https://dispoplan.one";
}

function currentMonthStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * verfuegbarkeit_broadcast
 * Sends the monthly availability link to all active Mitarbeiter who have
 * linked their Telegram account.
 *
 * Optional payload: { monat?: string }  (defaults to the current month)
 */
async function handleVerfuegbarkeitBroadcast(payload: Record<string, unknown>) {
  const monat = typeof payload?.monat === "string" ? payload.monat : currentMonthStr();

  const { data: empfaenger, error } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id, vorname, nachname, telegram_chat_id, zugangs_token")
    .eq("aktiv", true)
    .not("telegram_chat_id", "is", null);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const [y, m] = monat.split("-").map(Number);
  const monatLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  const origin = publicOrigin();
  let gesendet = 0;
  const fehler: string[] = [];

  for (const ma of empfaenger ?? []) {
    const link = `${origin}/m/${ma.zugangs_token}?monat=${monat}`;
    const text = `Hallo ${ma.vorname}, bitte trage deine Verfügbarkeit für ${monatLabel} ein:\n${link}`;
    try {
      const res = await tgSendMessage(Number(ma.telegram_chat_id), text);
      gesendet++;
      await logVersand({
        kanal: "telegram",
        richtung: "out",
        status: "sent",
        empfaenger: String(ma.telegram_chat_id),
        betreff: `Verfügbarkeit ${monatLabel}`,
        inhalt: text,
        mitarbeiter_id: ma.id,
        referenz_typ: "verfuegbarkeit_broadcast",
        metadata: {
          monat,
          provider_message_id: res?.result?.message_id ?? null,
          provider_status: 200,
          provider_response: res,
          source: "hermes_webhook",
        },
      });
    } catch (e: any) {
      fehler.push(`${ma.nachname}: ${e.message}`);
      await logVersand({
        kanal: "telegram",
        richtung: "out",
        status: "failed",
        empfaenger: String(ma.telegram_chat_id),
        betreff: `Verfügbarkeit ${monatLabel}`,
        inhalt: text,
        mitarbeiter_id: ma.id,
        fehler: e.message,
        referenz_typ: "verfuegbarkeit_broadcast",
        metadata: {
          monat,
          provider_status: e?.status ?? null,
          provider_response: e?.providerBody ?? null,
          source: "hermes_webhook",
          retry: { kind: "telegram_send", chat_id: Number(ma.telegram_chat_id), text },
        },
      });
    }
  }

  return { gesendet, gesamt: (empfaenger ?? []).length, fehler };
}

/**
 * test
 * Sends a test Telegram message to a specific chat_id.
 *
 * Required payload: { chat_id: number, text?: string }
 */
async function handleTest(payload: Record<string, unknown>) {
  const chatId = Number(payload?.chat_id);
  if (!chatId || isNaN(chatId)) {
    throw new Error("payload.chat_id (number) is required for action 'test'");
  }
  const text =
    typeof payload?.text === "string" && payload.text.trim()
      ? payload.text.trim()
      : "✅ Hermes Webhook Test — Verbindung erfolgreich!";

  const res = await tgSendMessage(chatId, text);
  return { message_id: res?.result?.message_id ?? null };
}

/**
 * einsatz_bestaetigt
 * Triggers the confirmation flow for a specific Einsatz:
 *  - Fetches the Einsatz and associated Mitarbeiter
 *  - Sends a Telegram confirmation message to the Mitarbeiter
 *  - Logs the outbound message in versand_log
 *
 * Required payload: { einsatz_id: string }
 */
async function handleEinsatzBestaetigt(payload: Record<string, unknown>) {
  const einsatzId = typeof payload?.einsatz_id === "string" ? payload.einsatz_id : null;
  if (!einsatzId) {
    throw new Error("payload.einsatz_id (UUID string) is required for action 'einsatz_bestaetigt'");
  }

  const { data: einsatz, error } = await supabaseAdmin
    .from("einsaetze")
    .select(
      "id, datum, dienst, status, mitarbeiter_id, einrichtung_id, mitarbeiter:mitarbeiter_id(id, vorname, nachname, telegram_chat_id), einrichtung:einrichtung_id(name, ort)",
    )
    .eq("id", einsatzId)
    .maybeSingle();

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!einsatz) throw new Error(`Einsatz ${einsatzId} nicht gefunden`);

  const ma = Array.isArray(einsatz.mitarbeiter) ? einsatz.mitarbeiter[0] : einsatz.mitarbeiter;
  const ein = Array.isArray(einsatz.einrichtung) ? einsatz.einrichtung[0] : einsatz.einrichtung;

  if (!ma?.telegram_chat_id) {
    return { skipped: true, reason: "Mitarbeiter hat keine verknüpfte Telegram-Chat-ID" };
  }

  const chatId = Number(ma.telegram_chat_id);
  const datumStr = new Date(einsatz.datum + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const DIENST_LANG: Record<string, string> = {
    F: "Frühdienst",
    S: "Spätdienst",
    N: "Nachtdienst",
  };
  const dienstLabel = DIENST_LANG[einsatz.dienst] ?? einsatz.dienst;
  const ortLabel = ein?.ort ? `${ein.name} (${ein.ort})` : ein?.name ?? "Einrichtung";

  const text =
    `✅ Dein Einsatz wurde bestätigt, ${ma.vorname}!\n\n` +
    `📅 ${datumStr}\n` +
    `🕐 ${dienstLabel}\n` +
    `🏥 ${ortLabel}\n\n` +
    `Bei Fragen wende dich bitte an die Disposition.`;

  try {
    const res = await tgSendMessage(chatId, text);
    await logVersand({
      kanal: "telegram",
      richtung: "out",
      status: "sent",
      empfaenger: String(ma.telegram_chat_id),
      betreff: `Einsatzbestätigung ${datumStr}`,
      inhalt: text,
      mitarbeiter_id: ma.id,
      einrichtung_id: einsatz.einrichtung_id,
      referenz_typ: "einsatz_bestaetigt",
      metadata: {
        einsatz_id: einsatzId,
        provider_message_id: res?.result?.message_id ?? null,
        provider_status: 200,
        provider_response: res,
        source: "hermes_webhook",
      },
    });
    return { ok: true, message_id: res?.result?.message_id ?? null };
  } catch (e: any) {
    await logVersand({
      kanal: "telegram",
      richtung: "out",
      status: "failed",
      empfaenger: String(ma.telegram_chat_id),
      betreff: `Einsatzbestätigung ${datumStr}`,
      inhalt: text,
      mitarbeiter_id: ma.id,
      einrichtung_id: einsatz.einrichtung_id,
      fehler: e.message,
      referenz_typ: "einsatz_bestaetigt",
      metadata: {
        einsatz_id: einsatzId,
        provider_status: e?.status ?? null,
        provider_response: e?.providerBody ?? null,
        source: "hermes_webhook",
        retry: { kind: "telegram_send", chat_id: chatId, text },
      },
    });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/hermes/trigger")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ── 1. Validate shared secret ──────────────────────────────────────
        const webhookSecret = process.env.HERMES_WEBHOOK_SECRET;
        if (!webhookSecret) {
          return new Response("HERMES_WEBHOOK_SECRET not configured", { status: 500 });
        }

        let body: { action?: unknown; secret?: unknown; payload?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        if (typeof body?.secret !== "string" || !safeEqual(body.secret, webhookSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const action = typeof body?.action === "string" ? body.action : null;
        if (!action) {
          return new Response("Missing or invalid 'action' field", { status: 400 });
        }

        const payload =
          body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : {};

        // ── 2. Dispatch action ─────────────────────────────────────────────
        try {
          switch (action) {
            case "verfuegbarkeit_broadcast": {
              const result = await handleVerfuegbarkeitBroadcast(payload);
              return Response.json({ ok: true, action, ...result });
            }

            case "test": {
              const result = await handleTest(payload);
              return Response.json({ ok: true, action, ...result });
            }

            case "einsatz_bestaetigt": {
              const result = await handleEinsatzBestaetigt(payload);
              return Response.json({ ok: true, action, ...result });
            }

            default:
              return new Response(`Unknown action: ${action}`, { status: 400 });
          }
        } catch (e: any) {
          console.error("[hermes/trigger] action error", { action, error: e?.message });
          return Response.json({ ok: false, action, error: e?.message ?? "Internal error" }, { status: 500 });
        }
      },

      GET: async () => new Response("Method not allowed", { status: 405 }),
    },
  },
});
