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


