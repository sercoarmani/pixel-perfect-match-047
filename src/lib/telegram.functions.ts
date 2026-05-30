import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tgGetMe, tgSendMessage, tgSetWebhook } from "@/lib/telegram.server";
import { qualErfuellt } from "@/lib/matching";

const DIENST_LANG: Record<string, string> = { F: "Frühdienst", S: "Spätdienst", N: "Nachtdienst" };

function publicOrigin(): string {
  // Öffentlich erreichbare URL (für Telegram-Links). Über env überschreibbar.
  // Default: stabile Produktions-URL des veröffentlichten Projekts.
  const env = process.env.PUBLIC_APP_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  return "https://project--0ceef16a-44ab-4863-91ea-da069df2e318.lovable.app";
}

export const getTelegramBotInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const me = await tgGetMe();
      return { username: me.username ?? null, name: me.first_name ?? null };
    } catch (e: any) {
      return { username: null, name: null, error: e.message as string };
    }
  });

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const url = `${publicOrigin()}/api/public/telegram/webhook`;
    const res = await tgSetWebhook(url);
    return { ok: true, url, result: res?.result ?? res };
  });

/** Persönlichen Bot-Start-Link an einen Mitarbeiter senden (über bereits verknüpften Chat). */
export const sendPersonalLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { mitarbeiter_id: string }) =>
    z.object({ mitarbeiter_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: m, error } = await supabase
      .from("mitarbeiter")
      .select("id, vorname, nachname, telegram_chat_id, zugangs_token")
      .eq("id", data.mitarbeiter_id)
      .single();
    if (error || !m) throw new Error(error?.message ?? "Mitarbeiter nicht gefunden");
    if (!m.telegram_chat_id) throw new Error("Mitarbeiter hat den Bot noch nicht gestartet.");
    const link = `${publicOrigin()}/m/${m.zugangs_token}`;
    await tgSendMessage(
      Number(m.telegram_chat_id),
      `Hallo ${m.vorname}, dein persönlicher Verfügbarkeits-Link:\n${link}`,
    );
    return { ok: true };
  });

/** Verfügbarkeitslink für einen Monat an alle verknüpften Mitarbeiter senden. */
export const sendVerfuegbarkeitsBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { monat: string; nur_aktive?: boolean }) =>
    z.object({
      monat: z.string().regex(/^\d{4}-\d{2}$/),
      nur_aktive: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("mitarbeiter")
      .select("id, vorname, nachname, telegram_chat_id, zugangs_token, aktiv")
      .not("telegram_chat_id", "is", null);
    if (data.nur_aktive !== false) q = q.eq("aktiv", true);
    const { data: empfaenger, error } = await q;
    if (error) throw new Error(error.message);

    const [y, m] = data.monat.split("-").map(Number);
    const monatLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });

    let gesendet = 0;
    const fehler: string[] = [];
    for (const ma of empfaenger ?? []) {
      try {
        const link = `${publicOrigin()}/m/${ma.zugangs_token}?monat=${data.monat}`;
        await tgSendMessage(
          Number(ma.telegram_chat_id),
          `Hallo ${ma.vorname}, bitte trage deine Verfügbarkeit für ${monatLabel} ein:\n${link}`,
        );
        gesendet++;
      } catch (e: any) {
        fehler.push(`${ma.nachname}: ${e.message}`);
      }
    }
    return { ok: true, gesendet, gesamt: (empfaenger ?? []).length, fehler };
  });

/** Broadcast für einen offenen Bedarf an alle passenden, verknüpften Mitarbeiter. */
export const sendBedarfBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bedarf_id: string; nur_verfuegbar?: boolean }) =>
    z.object({
      bedarf_id: z.string().uuid(),
      nur_verfuegbar: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bedarf, error } = await supabase
      .from("bedarfe")
      .select("id, datum, dienst, qualifikation, einrichtung_id, ergebnis, anzahl")
      .eq("id", data.bedarf_id)
      .single();
    if (error || !bedarf) throw new Error(error?.message ?? "Bedarf nicht gefunden");
    if (bedarf.ergebnis !== "offen") throw new Error("Bedarf ist nicht offen.");

    const { data: ein } = await supabase
      .from("einrichtungen")
      .select("name, ort")
      .eq("id", bedarf.einrichtung_id)
      .single();

    const { data: mitarbeiter } = await supabase
      .from("mitarbeiter")
      .select("id, vorname, nachname, qualifikation, dienste_moeglich, telegram_chat_id, aktiv")
      .eq("aktiv", true)
      .not("telegram_chat_id", "is", null);

    const empfaenger = (mitarbeiter ?? []).filter(
      (m: any) =>
        qualErfuellt(m.qualifikation, bedarf.qualifikation) &&
        (m.dienste_moeglich ?? []).includes(bedarf.dienst),
    );

    if (data.nur_verfuegbar) {
      const ids = empfaenger.map((m) => m.id);
      if (ids.length === 0) return { ok: true, gesendet: 0, gesamt: 0 };
      const { data: verf } = await supabase
        .from("verfuegbarkeiten")
        .select("mitarbeiter_id")
        .eq("datum", bedarf.datum)
        .eq("dienst", bedarf.dienst)
        .eq("verfuegbar", true)
        .eq("status", "frei")
        .in("mitarbeiter_id", ids);
      const freie = new Set((verf ?? []).map((v: any) => v.mitarbeiter_id));
      empfaenger.splice(0, empfaenger.length, ...empfaenger.filter((m) => freie.has(m.id)));
    }

    const datumStr = new Date(bedarf.datum + "T00:00:00").toLocaleDateString("de-DE", {
      weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
    });
    const ort = ein?.ort ? `${ein.name} (${ein.ort})` : ein?.name ?? "Einrichtung";

    const reply_markup = {
      inline_keyboard: [[
        { text: "✅ Zusage", callback_data: `z:${bedarf.id}` },
        { text: "❌ Absage", callback_data: `a:${bedarf.id}` },
      ]],
    };

    let gesendet = 0;
    const fehler: string[] = [];
    for (const m of empfaenger) {
      try {
        await tgSendMessage(
          Number(m.telegram_chat_id),
          `Hallo ${m.vorname},\n\n📅 ${datumStr} – ${DIENST_LANG[bedarf.dienst] ?? bedarf.dienst}\n🏥 ${ort}\n🎓 ${bedarf.qualifikation}\n\nKannst du den Dienst übernehmen?`,
          { reply_markup },
        );
        gesendet++;
      } catch (e: any) {
        fehler.push(`${m.nachname}: ${e.message}`);
      }
    }
    return { ok: true, gesendet, gesamt: empfaenger.length, fehler };
  });
