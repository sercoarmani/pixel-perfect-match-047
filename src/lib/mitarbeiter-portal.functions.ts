import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Token-Format: Hex (aus gen_random_uuid), ~40 Zeichen.
const TokenSchema = z.string().min(16).max(80).regex(/^[a-f0-9]+$/);

/**
 * Löst den persönlichen Token zu genau einem Mitarbeiter auf.
 * Gibt niemals Daten anderer Mitarbeiter zurück. Läuft serverseitig mit
 * Service-Role; der Browser sieht nur das Ergebnis dieser Funktion.
 */
async function mitarbeiterAusToken(token: string) {
  const { data, error } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id, vorname, nachname, status, aktiv")
    .eq("zugangs_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Public: eigenes Profil + eigene Verfügbarkeiten ----------
export const getMitarbeiterPortal = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string; monat?: string }) =>
    z.object({
      token: TokenSchema,
      monat: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusToken(data.token);
    if (!ma) return null;

    let von: string;
    let bis: string | null = null;
    if (data.monat) {
      const [y, m] = data.monat.split("-").map(Number);
      von = `${data.monat}-01`;
      const ende = new Date(Date.UTC(y, m, 0)); // letzter Tag des Monats
      bis = ende.toISOString().slice(0, 10);
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

// ---------- Public: eigene Verfügbarkeit melden ----------
export const submitMeineVerfuegbarkeit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: TokenSchema,
      eintraege: z.array(z.object({
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dienst: z.enum(["F", "S", "N"]),
      })).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusToken(data.token);
    if (!ma) throw new Error("Ungültiger Link.");
    if (ma.aktiv === false || ma.status === "gesperrt") {
      throw new Error("Dein Zugang ist derzeit deaktiviert. Bitte wende dich an die Disposition.");
    }

    const heute = new Date().toISOString().slice(0, 10);
    const rows = data.eintraege
      .filter((e) => e.datum >= heute) // keine Vergangenheit
      .map((e) => ({
        mitarbeiter_id: ma.id,
        datum: e.datum,
        dienst: e.dienst,
        verfuegbar: true,
        status: "frei" as const,
        quelle: "portal",
      }));
    if (rows.length === 0) return { ok: true, anzahl: 0 };

    // Bereits vergebene Schichten werden NICHT überschrieben (ignoreDuplicates),
    // damit eine bestätigte Besetzung erhalten bleibt.
    const { error } = await supabaseAdmin
      .from("verfuegbarkeiten")
      .upsert(rows, { onConflict: "mitarbeiter_id,datum,dienst", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    return { ok: true, anzahl: rows.length };
  });

// ---------- Public: eigene (freie) Verfügbarkeit zurücknehmen ----------
export const deleteMeineVerfuegbarkeit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: TokenSchema,
      datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dienst: z.enum(["F", "S", "N"]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const ma = await mitarbeiterAusToken(data.token);
    if (!ma) throw new Error("Ungültiger Link.");

    // Nur freie (noch nicht vergebene) Verfügbarkeiten dürfen zurückgenommen werden.
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

// ---------- Admin: persönlichen Token neu erzeugen ----------
export const regenerateZugangsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mitarbeiter_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { error } = await context.supabase
      .from("mitarbeiter")
      .update({ zugangs_token: token })
      .eq("id", data.mitarbeiter_id);
    if (error) throw new Error(error.message);
    return { token };
  });
