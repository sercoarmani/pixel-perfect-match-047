import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


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
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase.from("einsaetze").update({
        mitarbeiter_id: data.mitarbeiter_id,
        einrichtung_id: data.einrichtung_id,
        datum: data.datum,
        dienst: data.dienst,
        status: data.status,
        notiz: data.notiz,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("einsaetze").insert({
      mitarbeiter_id: data.mitarbeiter_id,
      einrichtung_id: data.einrichtung_id,
      datum: data.datum,
      dienst: data.dienst,
      status: data.status ?? "GEPLANT",
      notiz: data.notiz,
    }).select("id").single();
    if (error) throw new Error(error.message);
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
    const { data, error } = await context.supabase.from("einrichtungen").select("*, traeger(name)").order("name");
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
const MitarbeiterRow = z.object({
  vorname: z.string().min(1).max(100),
  nachname: z.string().min(1).max(100),
  kuerzel: z.string().min(1).max(20),
  qualifikation: z.enum(["PFK", "PHK"]).default("PFK"),
  telefon: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  wohnort: z.string().max(200).optional().nullable(),
  anstellung: z.enum(["Vollzeit", "Teilzeit", "Minijob", "Freelance"]).optional(),
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
  art: z.enum(["URLAUB", "KRANK", "FREI", "FORTBILDUNG", "SONSTIGES"]),
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

export const importEinrichtungen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(EinrichtungRow).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let created = 0, updated = 0;
    const errors: { name: string; error: string }[] = [];
    for (const row of data.rows) {
      let traeger_id: string | null = null;
      if (row.traeger) {
        const { data: t } = await supabase.from("traeger").select("id").eq("name", row.traeger).maybeSingle();
        if (t) traeger_id = t.id;
        else {
          const { data: ins } = await supabase.from("traeger").insert({ name: row.traeger }).select("id").single();
          traeger_id = ins?.id ?? null;
        }
      }
      const { traeger: _t, ...rest } = row;
      const payload = { ...rest, traeger_id };
      const { data: existing } = await supabase
        .from("einrichtungen").select("id").eq("name", row.name).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("einrichtungen").update(payload).eq("id", existing.id);
        if (error) errors.push({ name: row.name, error: error.message });
        else updated++;
      } else {
        const { error } = await supabase.from("einrichtungen").insert(payload);
        if (error) errors.push({ name: row.name, error: error.message });
        else created++;
      }
    }
    return { created, updated, errors };
  });

export const importEinsaetze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(EinsatzRow).min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // pre-load lookup maps
    const { data: mits } = await supabase.from("mitarbeiter").select("id, kuerzel");
    const { data: eins } = await supabase.from("einrichtungen").select("id, name");
    const mitMap = new Map((mits ?? []).map((m) => [m.kuerzel.toLowerCase(), m.id]));
    const einMap = new Map((eins ?? []).map((e) => [e.name.toLowerCase(), e.id]));
    let created = 0, updated = 0;
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const mitarbeiter_id = mitMap.get(r.mitarbeiter_kuerzel.toLowerCase());
        const einrichtung_id = einMap.get(r.einrichtung_name.toLowerCase());
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
        errors.push({ row: i + 2, error: e.message });
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
