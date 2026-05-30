import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Verifiziert Telegram WebApp `initData` per HMAC-SHA256.
 * Siehe https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Gibt die Telegram-User-ID zurück, oder null wenn ungültig.
 */
function verifyInitData(initData: string, maxAgeSec = 24 * 60 * 60): { userId: number; username: string | null } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN ist nicht gesetzt");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) { console.warn("[miniapp] kein hash in initData"); return null; }
  params.delete("hash");
  // signature ist NICHT Teil des data_check_string
  params.delete("signature");

  // data_check_string = alphabetisch sortierte key=value, getrennt durch \n
  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheck).digest("hex");
  if (expected !== hash) {
    console.warn("[miniapp] hash mismatch", { keys: [...params.keys()] });
    return null;
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    console.warn("[miniapp] auth_date abgelaufen", authDate);
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") ?? "{}");
    if (typeof user.id !== "number") return null;
    return { userId: user.id, username: user.username ?? null };
  } catch {
    return null;
  }
}

async function mitarbeiterAusInitData(initData: string) {
  const verified = verifyInitData(initData);
  if (!verified) return null;
  const { data } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id, vorname, nachname, status, aktiv, telegram_chat_id")
    .eq("telegram_chat_id", verified.userId)
    .maybeSingle();
  return data;
}

const InitDataSchema = z.string().min(10).max(4096);
const MonatSchema = z.string().regex(/^\d{4}-\d{2}$/);

// ---------- Portal-Daten ----------
export const getMiniAppPortal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ initData: InitDataSchema, monat: MonatSchema.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusInitData(data.initData);
    if (!ma) return null;

    let von: string;
    let bis: string | null = null;
    if (data.monat) {
      const [y, m] = data.monat.split("-").map(Number);
      von = `${data.monat}-01`;
      bis = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else {
      von = new Date().toISOString().slice(0, 10);
    }

    let q = supabaseAdmin
      .from("verfuegbarkeiten")
      .select("id, datum, dienst, verfuegbar, status")
      .eq("mitarbeiter_id", ma.id)
      .gte("datum", von)
      .order("datum");
    if (bis) q = q.lte("datum", bis);
    const { data: verf } = await q;

    return {
      mitarbeiter: { vorname: ma.vorname, nachname: ma.nachname, status: ma.status, aktiv: ma.aktiv },
      verfuegbarkeiten: verf ?? [],
    };
  });

// ---------- Verfügbarkeit melden ----------
export const submitMiniAppVerfuegbarkeit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      initData: InitDataSchema,
      eintraege: z.array(z.object({
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dienst: z.enum(["F", "S", "N"]),
      })).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusInitData(data.initData);
    if (!ma) throw new Error("Ungültige Sitzung. Bitte öffne die App erneut über den Bot.");
    if (ma.aktiv === false || ma.status === "gesperrt") {
      throw new Error("Dein Zugang ist deaktiviert.");
    }

    const heute = new Date().toISOString().slice(0, 10);
    const rows = data.eintraege
      .filter((e) => e.datum >= heute)
      .map((e) => ({
        mitarbeiter_id: ma.id,
        datum: e.datum,
        dienst: e.dienst,
        verfuegbar: true,
        status: "frei" as const,
        quelle: "telegram_miniapp",
      }));
    if (rows.length === 0) return { ok: true, anzahl: 0 };

    const { error } = await supabaseAdmin
      .from("verfuegbarkeiten")
      .upsert(rows, { onConflict: "mitarbeiter_id,datum,dienst", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    return { ok: true, anzahl: rows.length };
  });

// ---------- Zurücknehmen ----------
export const deleteMiniAppVerfuegbarkeit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      initData: InitDataSchema,
      datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dienst: z.enum(["F", "S", "N"]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusInitData(data.initData);
    if (!ma) throw new Error("Ungültige Sitzung.");

    const { error } = await supabaseAdmin
      .from("verfuegbarkeiten")
      .delete()
      .eq("mitarbeiter_id", ma.id)
      .eq("datum", data.datum)
      .eq("dienst", data.dienst)
      .eq("status", "frei");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
