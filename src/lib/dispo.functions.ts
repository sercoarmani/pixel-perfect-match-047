import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  qualErfuellt, dienstMoeglich, maEinplanbar, einsatzBelegt,
  REAKTION_MAX_STUNDEN, istImRadius, RADIUS_FAKTOR_DEFAULT,
} from "@/lib/matching";
import { createKundenbestaetigungDraft } from "@/lib/kunden-bestaetigung.server";

/** Best-effort Auto-Trigger für Block 5/6 nach MA-Zusage / Dispo-Zuteilung. */
async function autoTriggerKundenbestaetigung(input: {
  mitarbeiter_id: string;
  einrichtung_id: string;
  datum: string;
  dienst: string;
  einsatz_id?: string | null;
  bedarf_id?: string | null;
}): Promise<void> {
  try {
    await createKundenbestaetigungDraft(input);
  } catch (err) {
    console.error("[auto-trigger kundenbestaetigung] failed:", err);
  }
}

/** Übersetzt die DB-Sperre (UNIQUE-Verletzung) in eine verständliche Meldung. */
function istDoppelbelegungFehler(err: any): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|einsaetze_max_eins_pro_tag/i.test(String(err.message ?? ""));
}
function doppelbelegungMeldung(datum: string): string {
  return `Doppelbelegung am ${datum}: Der/die Mitarbeiter:in hat an diesem Tag bereits einen aktiven Einsatz.`;
}


// ---------- Plan / Matrix ----------
export const getPlanData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { von: string; bis: string }) =>
    z.object({ von: z.string(), bis: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [mit, ein, einsaetze, abw, verf, bedarfe] = await Promise.all([
      supabase.from("mitarbeiter").select("*").eq("aktiv", true).order("nachname"),
      supabase.from("einrichtungen").select("*").eq("aktiv", true).order("name"),
      supabase.from("einsaetze").select("*").gte("datum", data.von).lte("datum", data.bis),
      supabase.from("abwesenheiten").select("*").gte("datum", data.von).lte("datum", data.bis),
      supabase.from("verfuegbarkeiten").select("*").gte("datum", data.von).lte("datum", data.bis),
      supabase.from("bedarfe").select("*").gte("datum", data.von).lte("datum", data.bis),
    ]);
    return {
      mitarbeiter: mit.data ?? [],
      einrichtungen: ein.data ?? [],
      einsaetze: einsaetze.data ?? [],
      abwesenheiten: abw.data ?? [],
      verfuegbarkeiten: verf.data ?? [],
      bedarfe: bedarfe.data ?? [],
    };
  });

// ---------- Einsatz upsert / delete ----------
export const upsertEinsatz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      mitarbeiter_id: z.string().uuid(),
      einrichtung_id: z.string().uuid(),
      datum: z.string(),
      dienst: z.enum(["F", "S", "N"]),
      status: z.enum(["GEPLANT", "INTERN", "ZUR_UEBERPRUEFUNG", "BESTAETIGT", "ABGESAGT", "AUSGEPLANT"]).optional(),
      notiz: z.string().optional().nullable(),
      // Erlaubt dem Disponenten, eine erkannte Doppelbelegung/Abwesenheit bewusst zu überschreiben.
      erlaube_konflikt: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const status = data.status ?? "GEPLANT";

    // ---- Konfliktprüfung (nur wenn der Einsatz den MA tatsächlich belegt) ----
    if (!data.erlaube_konflikt && einsatzBelegt(status)) {
      // 1) Abwesenheit am selben Tag?
      const { data: abw } = await supabase
        .from("abwesenheiten")
        .select("art")
        .eq("mitarbeiter_id", data.mitarbeiter_id)
        .eq("datum", data.datum)
        .limit(1);
      if (abw && abw.length > 0) {
        throw new Error(
          `Mitarbeiter ist am ${data.datum} abwesend (${abw[0].art}). Bitte zuerst die Abwesenheit entfernen.`,
        );
      }
      // 2) Bereits anderer belegender Einsatz am selben Tag?
      const { data: vorhandene } = await supabase
        .from("einsaetze")
        .select("id, dienst, status")
        .eq("mitarbeiter_id", data.mitarbeiter_id)
        .eq("datum", data.datum);
      const konflikt = (vorhandene ?? []).find(
        (e) => e.id !== data.id && einsatzBelegt(e.status),
      );
      if (konflikt) {
        throw new Error(
          `Doppelbelegung am ${data.datum}: Mitarbeiter hat bereits einen ${konflikt.dienst}-Dienst. ` +
          `Bitte den bestehenden Einsatz anpassen oder die Belegung bewusst zulassen.`,
        );
      }
    }

    if (data.id) {
      // Vorherigen Status lesen, um Übergang nach BESTAETIGT zu erkennen
      const { data: vorher } = await supabase
        .from("einsaetze")
        .select("status")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await supabase.from("einsaetze").update({
        mitarbeiter_id: data.mitarbeiter_id,
        einrichtung_id: data.einrichtung_id,
        datum: data.datum,
        dienst: data.dienst,
        status,
        notiz: data.notiz,
      }).eq("id", data.id);
      if (error) throw new Error(istDoppelbelegungFehler(error) ? doppelbelegungMeldung(data.datum) : error.message);
      if (status === "BESTAETIGT" && vorher?.status !== "BESTAETIGT") {
        await autoTriggerKundenbestaetigung({
          mitarbeiter_id: data.mitarbeiter_id,
          einrichtung_id: data.einrichtung_id,
          datum: data.datum,
          dienst: data.dienst,
          einsatz_id: data.id,
        });
      }
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("einsaetze").insert({
      mitarbeiter_id: data.mitarbeiter_id,
      einrichtung_id: data.einrichtung_id,
      datum: data.datum,
      dienst: data.dienst,
      status,
      notiz: data.notiz,
    }).select("id").single();
    if (error) throw new Error(istDoppelbelegungFehler(error) ? doppelbelegungMeldung(data.datum) : error.message);
    if (status === "BESTAETIGT") {
      await autoTriggerKundenbestaetigung({
        mitarbeiter_id: data.mitarbeiter_id,
        einrichtung_id: data.einrichtung_id,
        datum: data.datum,
        dienst: data.dienst,
        einsatz_id: row.id,
      });
    }
    return { id: row.id };
  });

export const deleteEinsatz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("einsaetze").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Mitarbeiter CRUD ----------
export const listMitarbeiter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("mitarbeiter").select("*").order("nachname");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertMitarbeiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      vorname: z.string().min(1).max(100),
      nachname: z.string().min(1).max(100),
      kuerzel: z.string().min(1).max(20),
      qualifikation: z.enum(["PFK", "PHK", "GuK", "PFA", "PFM", "PFF", "Azubi", "Berufserfahrung", "LG1_LG2", "Krankenschwester"]),
      anstellung: z.enum(["Vollzeit", "Teilzeit", "Minijob"]),
      telefon: z.string().max(50).optional().nullable(),
      email: z.string().email().max(255).optional().nullable().or(z.literal("")),
      wohnort: z.string().max(100).optional().nullable(),
      notiz: z.string().max(2000).optional().nullable(),
      aktiv: z.boolean().optional(),
      // Dispo-relevante Felder (werden von der Vorschlags-/Anrufliste genutzt):
      dienste_moeglich: z.array(z.enum(["F", "S", "N"])).optional(),
      max_einsaetze: z.number().int().min(0).max(62).optional(),
      umkreis_km: z.number().min(0).max(2000).optional().nullable(),
      status: z.enum(["aktiv", "austritt", "schwanger", "gesperrt", "inaktiv"]).optional(),
      plz: z.string().max(10).optional().nullable(),
      strasse: z.string().max(200).optional().nullable(),
      ort: z.string().max(100).optional().nullable(),
      max_radius_km: z.number().min(0).max(2000).optional().nullable(),
      fuehrerschein: z.boolean().optional(),
      profil_text: z.string().max(4000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, email: data.email || null };
    if (data.id) {
      const { error } = await context.supabase.from("mitarbeiter").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("mitarbeiter").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ---------- Einrichtungen ----------
export const listEinrichtungen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("einrichtungen").select("*, traeger:traeger_id(name)").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertEinrichtung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      ort: z.string().max(100).optional().nullable(),
      wohnbereich: z.string().max(100).optional().nullable(),
      kontakt_name: z.string().max(100).optional().nullable(),
      kontakt_telefon: z.string().max(50).optional().nullable(),
      kontakt_email: z.string().email().max(255).optional().nullable().or(z.literal("")),
      vs_satz_pfk: z.number().optional().nullable(),
      vs_satz_phk: z.number().optional().nullable(),
      notiz: z.string().max(2000).optional().nullable(),
      aktiv: z.boolean().optional(),
      kunde_angelegt: z.boolean().optional(),
      traeger_id: z.string().uuid().optional().nullable(),
      strasse: z.string().max(200).optional().nullable(),
      plz: z.string().max(10).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, kontakt_email: data.kontakt_email || null };
    if (data.id) {
      const { error } = await context.supabase.from("einrichtungen").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("einrichtungen").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ---------- Anfragen / Token-Links ----------
function randomToken(len = 24) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

export const listAnfragen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("anfragen")
      .select("*")
      .order("erstellt_am", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const createAnfrage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      typ: z.enum(["verfuegbarkeit", "bedarf"]),
      empfaenger_typ: z.enum(["mitarbeiter", "einrichtung"]),
      empfaenger_id: z.string().uuid(),
      zeitraum_von: z.string(),
      zeitraum_bis: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const token = randomToken(24);
    const { data: row, error } = await context.supabase.from("anfragen").insert({
      ...data,
      token,
      erstellt_von: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("nachrichten_templates").select("*").order("schluessel");
    if (error) throw new Error(error.message);
    return data;
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nachrichten_templates")
      .update({ text: data.text, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



// ---------- Excel Import ----------
const QualifikationEnum = z.enum(["PFK","PHK","GuK","PFA","PFM","PFF","Azubi","Berufserfahrung","LG1_LG2","Krankenschwester"]);
const MitarbeiterRow = z.object({
  vorname: z.string().min(1).max(100),
  nachname: z.string().min(1).max(100),
  kuerzel: z.string().min(1).max(20),
  qualifikation: QualifikationEnum.default("PFK"),
  telefon: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  wohnort: z.string().max(200).optional().nullable(),
  anstellung: z.enum(["Vollzeit", "Teilzeit", "Minijob"]).optional(),
  notiz: z.string().max(2000).optional().nullable(),
});

const EinrichtungRow = z.object({
  name: z.string().min(1).max(200),
  traeger: z.string().max(200).optional().nullable(),
  ort: z.string().max(200).optional().nullable(),
  wohnbereich: z.string().max(200).optional().nullable(),
  kontakt_name: z.string().max(200).optional().nullable(),
  kontakt_telefon: z.string().max(50).optional().nullable(),
  kontakt_email: z.string().email().max(255).optional().nullable(),
  vs_satz_pfk: z.number().optional().nullable(),
  vs_satz_phk: z.number().optional().nullable(),
  notiz: z.string().max(2000).optional().nullable(),
});

const EinsatzRow = z.object({
  mitarbeiter_kuerzel: z.string().min(1).max(20),
  einrichtung_name: z.string().min(1).max(200),
  datum: z.string().min(8).max(20),
  dienst: z.enum(["F", "S", "N"]),
  status: z.enum(["GEPLANT", "INTERN", "ZUR_UEBERPRUEFUNG", "BESTAETIGT", "AUSGEPLANT", "ABGESAGT"]).optional(),
  notiz: z.string().max(2000).optional().nullable(),
});

const AbwesenheitRow = z.object({
  mitarbeiter_kuerzel: z.string().min(1).max(20),
  datum: z.string().min(8).max(20),
  art: z.enum(["Urlaub", "Wunschfrei", "krank_mit_AU", "krank_ohne_AU", "unbezahlter_Urlaub"]),
  notiz: z.string().max(2000).optional().nullable(),
});

function normalizeDate(s: string): string {
  // accept yyyy-mm-dd, dd.mm.yyyy, dd/mm/yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new Error(`Ungültiges Datum: ${s}`);
}

export const importMitarbeiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(MitarbeiterRow).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let created = 0, updated = 0;
    const errors: { kuerzel: string; error: string }[] = [];
    for (const row of data.rows) {
      const { data: existing } = await supabase
        .from("mitarbeiter").select("id").eq("kuerzel", row.kuerzel).maybeSingle();
      const payload = { ...row };
      if (existing) {
        const { error } = await supabase.from("mitarbeiter").update(payload).eq("id", existing.id);
        if (error) errors.push({ kuerzel: row.kuerzel, error: error.message });
        else updated++;
      } else {
        const { error } = await supabase.from("mitarbeiter").insert(payload);
        if (error) errors.push({ kuerzel: row.kuerzel, error: error.message });
        else created++;
      }
    }
    return { created, updated, errors };
  });

// Namens-Normalisierung: trim + interne Whitespaces auf eines reduzieren + lowercase.
// Wird als gemeinsamer Lookup-Key zwischen importEinrichtungen / importEinsaetze und
// dem Frontend-Coverage-Check benutzt.
function normalizeName(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export const importEinrichtungen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(EinrichtungRow).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let created = 0, updated = 0;
    const errors: { name: string; error: string }[] = [];
    const created_names: string[] = [];
    const updated_names: string[] = [];
    const created_records: { id: string; name: string }[] = [];
    const updated_records: { id: string; name: string }[] = [];

    // Bestehende Einrichtungen einmalig laden (case-/whitespace-tolerant matchen).
    const { data: existingAll } = await supabase.from("einrichtungen").select("id, name");
    const existingMap = new Map<string, { id: string; name: string }>(
      (existingAll ?? []).map((e: any) => [normalizeName(e.name), { id: e.id, name: e.name }]),
    );

    for (const row of data.rows) {
      const cleanName = (row.name ?? "").replace(/\s+/g, " ").trim();
      if (!cleanName) {
        errors.push({ name: row.name, error: "Leerer Name" });
        continue;
      }
      let traeger_id: string | null = null;
      const traegerName = row.traeger?.trim();
      if (traegerName) {
        try {
          const { data: t } = await supabase.from("traeger").select("id").eq("name", traegerName).maybeSingle();
          if (t) traeger_id = t.id;
          else {
            const { data: ins, error: insErr } = await supabase.from("traeger").insert({ name: traegerName }).select("id").single();
            if (!insErr) traeger_id = ins?.id ?? null;
          }
        } catch {
          // Träger-Lookup/Insert darf den Einrichtungs-Import nicht blockieren.
          traeger_id = null;
        }
      }
      const { traeger: _t, ...rest } = row;
      // Träger ist optional – Einrichtung wird auch ohne Träger angelegt (traeger_id = null).
      // kunde_angelegt: true → jede importierte Einrichtung gilt automatisch als verknüpfter Kunde.
      const payload = { ...rest, name: cleanName, traeger_id, kunde_angelegt: true };
      const existing = existingMap.get(normalizeName(cleanName));
      if (existing) {
        const { error } = await supabase.from("einrichtungen").update(payload).eq("id", existing.id);
        if (error) errors.push({ name: cleanName, error: error.message });
        else {
          updated++;
          updated_names.push(cleanName);
          updated_records.push({ id: existing.id, name: cleanName });
        }
      } else {
        const { data: ins, error } = await supabase.from("einrichtungen").insert(payload).select("id").single();
        if (error || !ins) errors.push({ name: cleanName, error: error?.message ?? "Insert ohne ID" });
        else {
          created++;
          created_names.push(cleanName);
          created_records.push({ id: ins.id, name: cleanName });
          // Cache aktualisieren, damit Folge-Zeilen mit gleichem Namen als Update behandelt werden.
          existingMap.set(normalizeName(cleanName), { id: ins.id, name: cleanName });
        }
      }
    }
    return { created, updated, errors, created_names, updated_names, created_records, updated_records };
  });

export const importEinsaetze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(EinsatzRow).min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // pre-load lookup maps (normalisiert für Whitespace-/Case-Toleranz)
    const { data: mits } = await supabase.from("mitarbeiter").select("id, kuerzel");
    const { data: eins } = await supabase.from("einrichtungen").select("id, name");
    const mitMap = new Map((mits ?? []).map((m) => [normalizeName(m.kuerzel), m.id]));
    const einMap = new Map((eins ?? []).map((e) => [normalizeName(e.name), e.id]));
    let created = 0, updated = 0;
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const mitarbeiter_id = mitMap.get(normalizeName(r.mitarbeiter_kuerzel));
        const einrichtung_id = einMap.get(normalizeName(r.einrichtung_name));
        if (!mitarbeiter_id) throw new Error(`Mitarbeiter '${r.mitarbeiter_kuerzel}' nicht gefunden`);
        if (!einrichtung_id) throw new Error(`Einrichtung '${r.einrichtung_name}' nicht gefunden`);
        const datum = normalizeDate(r.datum);
        const { data: existing } = await supabase.from("einsaetze").select("id")
          .eq("mitarbeiter_id", mitarbeiter_id).eq("datum", datum).eq("dienst", r.dienst).maybeSingle();
        const payload = {
          mitarbeiter_id, einrichtung_id, datum, dienst: r.dienst,
          status: r.status ?? "GEPLANT", notiz: r.notiz ?? null, quelle: "import",
        };
        if (existing) {
          const { error } = await supabase.from("einsaetze").update(payload).eq("id", existing.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("einsaetze").insert(payload);
          if (error) throw error;
          created++;
        }
      } catch (e: any) {
        errors.push({
          row: i + 2,
          error: istDoppelbelegungFehler(e) ? doppelbelegungMeldung(r.datum) : e.message,
        });
      }
    }
    return { created, updated, errors };
  });

export const importAbwesenheiten = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(AbwesenheitRow).min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: mits } = await supabase.from("mitarbeiter").select("id, kuerzel");
    const mitMap = new Map((mits ?? []).map((m) => [m.kuerzel.toLowerCase(), m.id]));
    let created = 0;
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const mitarbeiter_id = mitMap.get(r.mitarbeiter_kuerzel.toLowerCase());
        if (!mitarbeiter_id) throw new Error(`Mitarbeiter '${r.mitarbeiter_kuerzel}' nicht gefunden`);
        const datum = normalizeDate(r.datum);
        const { error } = await supabase.from("abwesenheiten").insert({
          mitarbeiter_id, datum, art: r.art, notiz: r.notiz ?? null,
        });
        if (error) throw error;
        created++;
      } catch (e: any) {
        errors.push({ row: i + 2, error: e.message });
      }
    }
    return { created, errors };
  });

// ---------- Dienstplan PDF data ----------
export const getMitarbeiterDienstplan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mitarbeiter_id: string; von: string; bis: string }) =>
    z.object({
      mitarbeiter_id: z.string().uuid(),
      von: z.string(),
      bis: z.string(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [mit, einsaetze, einrichtungen, abw] = await Promise.all([
      supabase.from("mitarbeiter").select("*").eq("id", data.mitarbeiter_id).single(),
      supabase.from("einsaetze").select("*").eq("mitarbeiter_id", data.mitarbeiter_id)
        .gte("datum", data.von).lte("datum", data.bis).order("datum"),
      supabase.from("einrichtungen").select("id, name, ort, wohnbereich"),
      supabase.from("abwesenheiten").select("*").eq("mitarbeiter_id", data.mitarbeiter_id)
        .gte("datum", data.von).lte("datum", data.bis).order("datum"),
    ]);
    const einMap = new Map((einrichtungen.data ?? []).map((e) => [e.id, e]));
    return {
      mitarbeiter: mit.data,
      einsaetze: (einsaetze.data ?? []).map((e) => ({ ...e, einrichtung: einMap.get(e.einrichtung_id) ?? null })),
      abwesenheiten: abw.data ?? [],
    };
  });

// ---------- Mitarbeiter-Detail (Verfügbarkeiten + besetzte Anfragen + Einsätze) ----------
export const getMitarbeiterDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mitarbeiter_id: string }) =>
    z.object({ mitarbeiter_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const heute = new Date().toISOString().slice(0, 10);
    const [mit, verf, anf, eins, einrichtungen] = await Promise.all([
      supabase.from("mitarbeiter").select("*").eq("id", data.mitarbeiter_id).single(),
      supabase.from("verfuegbarkeiten").select("*").eq("mitarbeiter_id", data.mitarbeiter_id).order("datum", { ascending: false }).limit(200),
      supabase.from("anfragen").select("*").eq("besetzt_durch", data.mitarbeiter_id).order("zeitraum_von", { ascending: false }).limit(100),
      supabase.from("einsaetze").select("*").eq("mitarbeiter_id", data.mitarbeiter_id).gte("datum", heute).order("datum").limit(100),
      supabase.from("einrichtungen").select("id, name, ort"),
    ]);
    const einMap = new Map((einrichtungen.data ?? []).map((e) => [e.id, e]));
    return {
      mitarbeiter: mit.data,
      verfuegbarkeiten: verf.data ?? [],
      anfragen: anf.data ?? [],
      einsaetze: (eins.data ?? []).map((e) => ({ ...e, einrichtung: einMap.get(e.einrichtung_id) ?? null })),
    };
  });

// ---------- Dashboard ----------
export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const heute = iso(today);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const monatStart = iso(new Date(today.getFullYear(), today.getMonth(), 1));
    const monatEnde = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const [maAll, einAll, einInaktiv, anfOffen, einsMonat, einsHeute, einsWoche, abwWoche, mitAll, einAllForMap, mitMaxAll, abwMonat, anfBeantwortet] = await Promise.all([
      supabase.from("mitarbeiter").select("id", { count: "exact", head: true }).eq("aktiv", true),
      supabase.from("einrichtungen").select("id", { count: "exact", head: true }).eq("aktiv", true),
      supabase.from("einrichtungen").select("id", { count: "exact", head: true }).eq("aktiv", false),
      supabase.from("anfragen").select("id", { count: "exact", head: true }).eq("status", "offen"),
      supabase.from("einsaetze").select("id, status, mitarbeiter_id, dienst", { count: "exact" }).gte("datum", monatStart).lte("datum", monatEnde),
      supabase.from("einsaetze").select("*").eq("datum", heute).order("dienst"),
      supabase.from("einsaetze").select("datum, status").gte("datum", heute).lte("datum", iso(in7)),
      supabase.from("abwesenheiten").select("*").gte("datum", heute).lte("datum", iso(in7)).order("datum"),
      supabase.from("mitarbeiter").select("id, vorname, nachname, kuerzel, qualifikation, anstellung"),
      supabase.from("einrichtungen").select("id, name, ort"),
      supabase.from("mitarbeiter").select("id, max_einsaetze, anstellung, qualifikation").eq("aktiv", true),
      supabase.from("abwesenheiten").select("mitarbeiter_id, datum").gte("datum", monatStart).lte("datum", monatEnde),
      supabase.from("anfragen").select("erstellt_am, beantwortet_am").not("beantwortet_am", "is", null).gte("erstellt_am", monatStart),
    ]);

    // Reaktionszeit (Dienstanfrage → Bestätigung): Mittelwert in Stunden
    const reaktionStunden: number[] = [];
    (anfBeantwortet.data ?? []).forEach((a: any) => {
      if (!a.erstellt_am || !a.beantwortet_am) return;
      const diff = (new Date(a.beantwortet_am).getTime() - new Date(a.erstellt_am).getTime()) / 36e5;
      if (diff >= 0 && diff < REAKTION_MAX_STUNDEN) reaktionStunden.push(diff);
    });
    const reaktionAvgH = reaktionStunden.length > 0
      ? Math.round((reaktionStunden.reduce((a, b) => a + b, 0) / reaktionStunden.length) * 10) / 10
      : null;

    const mitMap = new Map((mitAll.data ?? []).map((m) => [m.id, m]));
    const einMap = new Map((einAllForMap.data ?? []).map((e) => [e.id, e]));

    const statusZaehlung: Record<string, number> = {};
    (einsMonat.data ?? []).forEach((e: any) => { statusZaehlung[e.status] = (statusZaehlung[e.status] ?? 0) + 1; });

    const wochenZaehlung: Record<string, number> = {};
    (einsWoche.data ?? []).forEach((e: any) => { wochenZaehlung[e.datum] = (wochenZaehlung[e.datum] ?? 0) + 1; });

    // Mögliche Einsätze = Summe max_einsaetze - Abwesenheitstage (gedeckelt pro MA)
    const moeglichePerMA = new Map<string, number>();
    (mitMaxAll.data ?? []).forEach((m: any) => moeglichePerMA.set(m.id, m.max_einsaetze ?? 0));
    const abwPerMA = new Map<string, number>();
    (abwMonat.data ?? []).forEach((a: any) => abwPerMA.set(a.mitarbeiter_id, (abwPerMA.get(a.mitarbeiter_id) ?? 0) + 1));
    let moeglichSumme = 0;
    moeglichePerMA.forEach((max, id) => {
      const abwTage = abwPerMA.get(id) ?? 0;
      moeglichSumme += Math.max(0, max - abwTage);
    });

    const geplant = einsMonat.count ?? 0;
    const besetzt = (statusZaehlung["BESTAETIGT"] ?? 0) + (statusZaehlung["INTERN"] ?? 0);
    const besetztPct = geplant > 0 ? Math.round((besetzt / geplant) * 100) : 0;
    const auslastungPct = moeglichSumme > 0 ? Math.round((geplant / moeglichSumme) * 100) : 0;

    // Gruppierung Mitarbeiter nach Qualifikation
    const qualGruppen: Record<string, { gesamt: number; geplant: number }> = {};
    (mitMaxAll.data ?? []).forEach((m: any) => {
      const k = m.qualifikation;
      qualGruppen[k] = qualGruppen[k] ?? { gesamt: 0, geplant: 0 };
      qualGruppen[k].gesamt += 1;
    });
    (einsMonat.data ?? []).forEach((e: any) => {
      const ma = (mitMaxAll.data ?? []).find((m: any) => m.id === e.mitarbeiter_id);
      if (!ma) return;
      qualGruppen[ma.qualifikation] = qualGruppen[ma.qualifikation] ?? { gesamt: 0, geplant: 0 };
      qualGruppen[ma.qualifikation].geplant += 1;
    });

    return {
      kpis: {
        mitarbeiterAktiv: maAll.count ?? 0,
        einrichtungenAktiv: einAll.count ?? 0,
        einrichtungenInaktiv: einInaktiv.count ?? 0,
        anfragenOffen: anfOffen.count ?? 0,
        einsaetzeMonat: geplant,
        reaktionAvgH,
      },
      monatsStats: {
        geplant,
        besetzt,
        besetztPct,
        moeglich: moeglichSumme,
        auslastungPct,
        offen: geplant - besetzt,
      },
      qualGruppen,
      statusZaehlung,
      wochenZaehlung,
      einsaetzeHeute: (einsHeute.data ?? []).map((e: any) => ({
        ...e,
        mitarbeiter: mitMap.get(e.mitarbeiter_id) ?? null,
        einrichtung: einMap.get(e.einrichtung_id) ?? null,
      })),
      abwesenheitenWoche: (abwWoche.data ?? []).map((a: any) => ({
        ...a,
        mitarbeiter: mitMap.get(a.mitarbeiter_id) ?? null,
      })),
    };
  });

// ---------- Delete Mitarbeiter / Einrichtung ----------
export const deleteMitarbeiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("mitarbeiter").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEinrichtung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("einrichtungen").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Träger ----------
export const listTraeger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("traeger").select("*").order("name");
    if (error) throw new Error(error.message);
    return data;
  });

export const createTraeger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("traeger").insert({ name: data.name }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Abwesenheit ----------
export const upsertAbwesenheit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      mitarbeiter_id: z.string().uuid(),
      datum: z.string(),
      art: z.enum(["Urlaub", "unbezahlter_Urlaub", "krank_mit_AU", "krank_ohne_AU", "Wunschfrei"]),
      notiz: z.string().max(500).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase.from("abwesenheiten").update({
        mitarbeiter_id: data.mitarbeiter_id, datum: data.datum, art: data.art, notiz: data.notiz,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Remove einsatz on that day (krank überschreibt geplanten Dienst)
    await supabase.from("einsaetze").delete().eq("mitarbeiter_id", data.mitarbeiter_id).eq("datum", data.datum);
    await supabase.from("abwesenheiten").delete().eq("mitarbeiter_id", data.mitarbeiter_id).eq("datum", data.datum);
    const { data: row, error } = await supabase.from("abwesenheiten").insert({
      mitarbeiter_id: data.mitarbeiter_id, datum: data.datum, art: data.art, notiz: data.notiz,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAbwesenheit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mitarbeiter_id: z.string().uuid(), datum: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("abwesenheiten")
      .delete().eq("mitarbeiter_id", data.mitarbeiter_id).eq("datum", data.datum);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Statistik (Monatsvergleich + Jahr) ----------
export const getStatistik = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jahr?: number }) =>
    z.object({ jahr: z.number().int().min(2020).max(2100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const jahr = data.jahr ?? new Date().getFullYear();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const jahrStart = `${jahr}-01-01`;
    const jahrEnde = `${jahr}-12-31`;

    const [maAktiv, einAktiv, einInaktiv, einsaetze, abwesenheiten, anfragen, mitMax] = await Promise.all([
      supabase.from("mitarbeiter").select("id", { count: "exact", head: true }).eq("aktiv", true),
      supabase.from("einrichtungen").select("id", { count: "exact", head: true }).eq("aktiv", true),
      supabase.from("einrichtungen").select("id", { count: "exact", head: true }).eq("aktiv", false),
      supabase.from("einsaetze").select("datum, status, mitarbeiter_id").gte("datum", jahrStart).lte("datum", jahrEnde),
      supabase.from("abwesenheiten").select("datum, art").gte("datum", jahrStart).lte("datum", jahrEnde),
      supabase.from("anfragen").select("erstellt_am, beantwortet_am").gte("erstellt_am", `${jahr}-01-01T00:00:00Z`).lte("erstellt_am", `${jahr}-12-31T23:59:59Z`),
      supabase.from("mitarbeiter").select("id, max_einsaetze").eq("aktiv", true),
    ]);

    const maxProMA = (mitMax.data ?? []).reduce((s, m: any) => s + (m.max_einsaetze ?? 0), 0);

    const monate = Array.from({ length: 12 }, (_, i) => ({
      monat: i + 1,
      label: new Date(jahr, i, 1).toLocaleDateString("de-DE", { month: "short" }),
      geplant: 0,
      besetzt: 0,
      offen: 0,
      besetztPct: 0,
      auslastungPct: 0,
      urlaub: 0,
      krank: 0,
      reaktionAvgH: null as number | null,
    }));

    (einsaetze.data ?? []).forEach((e: any) => {
      const m = new Date(e.datum).getMonth();
      monate[m].geplant += 1;
      if (e.status === "BESTAETIGT" || e.status === "INTERN") monate[m].besetzt += 1;
    });

    (abwesenheiten.data ?? []).forEach((a: any) => {
      const m = new Date(a.datum).getMonth();
      if (a.art === "Urlaub" || a.art === "unbezahlter_Urlaub") monate[m].urlaub += 1;
      if (a.art === "krank_mit_AU" || a.art === "krank_ohne_AU") monate[m].krank += 1;
    });

    const reaktionPerMonat: number[][] = Array.from({ length: 12 }, () => []);
    (anfragen.data ?? []).forEach((a: any) => {
      if (!a.erstellt_am || !a.beantwortet_am) return;
      const diff = (new Date(a.beantwortet_am).getTime() - new Date(a.erstellt_am).getTime()) / 36e5;
      if (diff < 0 || diff > REAKTION_MAX_STUNDEN) return;
      const m = new Date(a.erstellt_am).getMonth();
      reaktionPerMonat[m].push(diff);
    });
    reaktionPerMonat.forEach((arr, i) => {
      if (arr.length === 0) return;
      monate[i].reaktionAvgH = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
    });

    monate.forEach((m) => {
      m.offen = m.geplant - m.besetzt;
      m.besetztPct = m.geplant > 0 ? Math.round((m.besetzt / m.geplant) * 100) : 0;
      m.auslastungPct = maxProMA > 0 ? Math.round((m.geplant / maxProMA) * 100) : 0;
    });

    const gesamt = monate.reduce(
      (acc, m) => ({
        geplant: acc.geplant + m.geplant,
        besetzt: acc.besetzt + m.besetzt,
        offen: acc.offen + m.offen,
        urlaub: acc.urlaub + m.urlaub,
        krank: acc.krank + m.krank,
      }),
      { geplant: 0, besetzt: 0, offen: 0, urlaub: 0, krank: 0 },
    );
    const reaktionAlle = reaktionPerMonat.flat();
    const reaktionGesamt = reaktionAlle.length > 0
      ? Math.round((reaktionAlle.reduce((a, b) => a + b, 0) / reaktionAlle.length) * 10) / 10
      : null;

    return {
      jahr,
      monate,
      gesamt: {
        ...gesamt,
        besetztPct: gesamt.geplant > 0 ? Math.round((gesamt.besetzt / gesamt.geplant) * 100) : 0,
        auslastungPct: maxProMA > 0 ? Math.round((gesamt.geplant / (maxProMA * 12)) * 100) : 0,
        reaktionAvgH: reaktionGesamt,
      },
      snapshot: {
        mitarbeiterAktiv: maAktiv.count ?? 0,
        einrichtungenAktiv: einAktiv.count ?? 0,
        einrichtungenInaktiv: einInaktiv.count ?? 0,
      },
    };
  });

// ---------- Disposition: offene Bedarfe + Anrufliste ----------
export const getDispoOffeneBedarfe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { radius_faktor?: number } | undefined) =>
    z
      .object({ radius_faktor: z.number().min(0).max(5).optional() })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const faktor = data?.radius_faktor ?? RADIUS_FAKTOR_DEFAULT;
    const heute = new Date().toISOString().slice(0, 10);

    const [bedarfeRes, mitRes, verfRes, einRes, abwRes, einsRes] = await Promise.all([
      supabase
        .from("bedarfe")
        .select("*")
        .eq("ergebnis", "offen")
        .gte("datum", heute)
        .order("datum"),
      supabase.from("mitarbeiter").select("*").eq("aktiv", true),
      supabase
        .from("verfuegbarkeiten")
        .select("*")
        .eq("status", "frei")
        .eq("verfuegbar", true)
        .gte("datum", heute),
      supabase.from("einrichtungen").select("id, name, ort, lat, lng"),
      supabase.from("abwesenheiten").select("mitarbeiter_id, datum").gte("datum", heute),
      supabase.from("einsaetze").select("mitarbeiter_id, datum, status").gte("datum", heute),
    ]);

    const mitarbeiter = mitRes.data ?? [];
    const verfuegbarkeiten = verfRes.data ?? [];
    const einMap = new Map((einRes.data ?? []).map((e) => [e.id, e]));

    const abwSet = new Set(
      (abwRes.data ?? []).map((a: any) => `${a.mitarbeiter_id}|${a.datum}`),
    );
    const belegtSet = new Set(
      (einsRes.data ?? [])
        .filter((e: any) => einsatzBelegt(e.status))
        .map((e: any) => `${e.mitarbeiter_id}|${e.datum}`),
    );

    const bedarfeMitAnrufliste = (bedarfeRes.data ?? []).map((b) => {
      const einrichtung = einMap.get(b.einrichtung_id) ?? null;
      const passend = mitarbeiter
        .filter((m: any) => maEinplanbar(m))
        .filter((m: any) => qualErfuellt(m.qualifikation, b.qualifikation))
        .filter((m: any) => dienstMoeglich(m.dienste_moeglich, b.dienst))
        .filter((m: any) => !abwSet.has(`${m.id}|${b.datum}`))
        .filter((m: any) => !belegtSet.has(`${m.id}|${b.datum}`))
        .filter((m: any) =>
          verfuegbarkeiten.some(
            (v: any) =>
              v.mitarbeiter_id === m.id &&
              v.datum === b.datum &&
              v.dienst === b.dienst,
          ),
        )
        .map((m: any) => {
          const geo = istImRadius(
            { lat: m.lat, lng: m.lng, max_radius_km: m.max_radius_km },
            { lat: einrichtung?.lat ?? null, lng: einrichtung?.lng ?? null },
            faktor,
          );
          return {
            id: m.id,
            kuerzel: m.kuerzel,
            vorname: m.vorname,
            nachname: m.nachname,
            qualifikation: m.qualifikation,
            telefon: m.telefon,
            umkreis_km: m.umkreis_km,
            max_radius_km: m.max_radius_km,
            distanz_km: geo.distanz_km,
            limit_km: geo.limit_km,
            im_radius: geo.ok,
          };
        })
        // Radius-Filter (passiert nur, wenn Geo-Daten vorhanden sind)
        .filter((m: any) => m.im_radius)
        .sort((a: any, b: any) => {
          const ax = a.distanz_km ?? a.umkreis_km ?? Number.POSITIVE_INFINITY;
          const bx = b.distanz_km ?? b.umkreis_km ?? Number.POSITIVE_INFINITY;
          return ax - bx;
        });
      return { ...b, einrichtung, anrufliste: passend };
    });

    return { bedarfe: bedarfeMitAnrufliste, radius_faktor: faktor };
  });



export const bedarfZusage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bedarf_id: string; mitarbeiter_id: string }) =>
    z.object({
      bedarf_id: z.string().uuid(),
      mitarbeiter_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: bedarf, error: bErr } = await supabase
      .from("bedarfe")
      .select("*")
      .eq("id", data.bedarf_id)
      .single();
    if (bErr || !bedarf) throw new Error(bErr?.message ?? "Bedarf nicht gefunden");
    if (bedarf.ergebnis !== "offen") throw new Error("Bedarf ist nicht mehr offen");

    // 0) Doppelbelegung verhindern: ist der MA an dem Tag schon belegt oder abwesend?
    const [{ data: tagEins }, { data: tagAbw }] = await Promise.all([
      supabase.from("einsaetze").select("status")
        .eq("mitarbeiter_id", data.mitarbeiter_id).eq("datum", bedarf.datum),
      supabase.from("abwesenheiten").select("art")
        .eq("mitarbeiter_id", data.mitarbeiter_id).eq("datum", bedarf.datum).limit(1),
    ]);
    if (tagAbw && tagAbw.length > 0) {
      throw new Error(`Mitarbeiter ist am ${bedarf.datum} abwesend (${tagAbw[0].art}).`);
    }
    if ((tagEins ?? []).some((e: any) => einsatzBelegt(e.status))) {
      throw new Error(`Mitarbeiter ist am ${bedarf.datum} bereits eingeplant (Doppelbelegung).`);
    }

    // 1) Einsatz anlegen (damit Dashboard/Matrix die Besetzung sehen)
    const { data: insertedEinsatz, error: insErr } = await supabase.from("einsaetze").insert({
      mitarbeiter_id: data.mitarbeiter_id,
      einrichtung_id: bedarf.einrichtung_id,
      datum: bedarf.datum,
      dienst: bedarf.dienst,
      status: "BESTAETIGT",
      quelle: "dispo",
      notiz: bedarf.notiz ?? null,
    }).select("id").maybeSingle();
    if (insErr) throw new Error(istDoppelbelegungFehler(insErr) ? doppelbelegungMeldung(bedarf.datum) : insErr.message);

    // 2) Zugehörige Verfügbarkeit auf "vergeben" setzen
    const { error: updVerfErr } = await supabase
      .from("verfuegbarkeiten")
      .update({ status: "vergeben" })
      .eq("mitarbeiter_id", data.mitarbeiter_id)
      .eq("datum", bedarf.datum)
      .eq("dienst", bedarf.dienst);
    if (updVerfErr) throw updVerfErr;

    // 3) Deckungsgrad bestimmen: zählt alle belegenden Einsätze für diese
    //    Einrichtung/Datum/Dienst. Erst wenn anzahl erreicht ist, gilt der
    //    Bedarf als vollständig abgedeckt – sonst bleibt er (teilbesetzt) offen.
    const { data: deckung } = await supabase
      .from("einsaetze")
      .select("status")
      .eq("einrichtung_id", bedarf.einrichtung_id)
      .eq("datum", bedarf.datum)
      .eq("dienst", bedarf.dienst);
    const besetztAnzahl = (deckung ?? []).filter((e: any) => einsatzBelegt(e.status)).length;
    const vollständig = besetztAnzahl >= (bedarf.anzahl ?? 1);

    const { error: updBedarfErr } = await supabase
      .from("bedarfe")
      .update({
        ergebnis: vollständig ? "abgedeckt" : "offen",
        besetzt_durch: data.mitarbeiter_id,
        status: vollständig ? "besetzt" : "in_bearbeitung",
      })
      .eq("id", data.bedarf_id);
    if (updBedarfErr) throw updBedarfErr;

    // 4) Block 5 + 6: Kundenbestätigung als Entwurf anlegen (Auto-Trigger bei Dispo-Zuteilung)
    await autoTriggerKundenbestaetigung({
      mitarbeiter_id: data.mitarbeiter_id,
      einrichtung_id: bedarf.einrichtung_id,
      bedarf_id: data.bedarf_id,
      einsatz_id: insertedEinsatz?.id ?? null,
      datum: bedarf.datum,
      dienst: bedarf.dienst,
    });

    return { ok: true, besetzt: besetztAnzahl, benoetigt: bedarf.anzahl ?? 1, vollständig };
  });

export const bedarfAbsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bedarf_id: string; mitarbeiter_id: string }) =>
    z.object({
      bedarf_id: z.string().uuid(),
      mitarbeiter_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Verfügbarkeit auf "frei" belassen; nur Absage als Notiz auf Bedarf protokollieren
    const { data: bedarf } = await supabase.from("bedarfe").select("notiz").eq("id", data.bedarf_id).single();
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const note = `${bedarf?.notiz ?? ""}\n[${stamp}] Absage von MA ${data.mitarbeiter_id}`.trim();
    const { error } = await supabase.from("bedarfe").update({ notiz: note }).eq("id", data.bedarf_id);
    if (error) throw error;
    return { ok: true };
  });
