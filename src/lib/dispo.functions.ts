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

// ---------- Public token endpoints (no auth) ----------
export const getAnfrageByToken = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(8).max(64).regex(/^[a-z0-9]+$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: anfrage, error } = await supabaseAdmin
      .from("anfragen")
      .select("id, typ, empfaenger_typ, empfaenger_id, zeitraum_von, zeitraum_bis, status, ablauf_datum")
      .eq("token", data.token)
      .single();
    if (error || !anfrage) return null;
    if (new Date(anfrage.ablauf_datum) < new Date()) return { expired: true as const };

    if (anfrage.empfaenger_typ === "mitarbeiter") {
      const { data: m } = await supabaseAdmin
        .from("mitarbeiter")
        .select("vorname, nachname, kuerzel, qualifikation")
        .eq("id", anfrage.empfaenger_id)
        .single();
      return { anfrage, mitarbeiter: m };
    } else {
      const { data: e } = await supabaseAdmin
        .from("einrichtungen")
        .select("name, ort")
        .eq("id", anfrage.empfaenger_id)
        .single();
      return { anfrage, einrichtung: e };
    }
  });

export const submitVerfuegbarkeit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(8).max(64).regex(/^[a-z0-9]+$/),
      eintraege: z.array(z.object({
        datum: z.string(),
        dienst: z.enum(["F", "S", "N"]),
        verfuegbar: z.boolean(),
      })).min(1).max(500),
      notiz: z.string().max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: anfrage, error } = await supabaseAdmin
      .from("anfragen").select("*").eq("token", data.token).single();
    if (error || !anfrage) throw new Error("Ungültiger Link");
    if (new Date(anfrage.ablauf_datum) < new Date()) throw new Error("Link abgelaufen");
    if (anfrage.empfaenger_typ !== "mitarbeiter") throw new Error("Falscher Linktyp");

    // delete existing token-submitted entries in range, then insert new
    await supabaseAdmin.from("verfuegbarkeiten")
      .delete()
      .eq("mitarbeiter_id", anfrage.empfaenger_id)
      .gte("datum", anfrage.zeitraum_von)
      .lte("datum", anfrage.zeitraum_bis)
      .eq("quelle", `token:${data.token}`);

    const rows = data.eintraege.map((e) => ({
      mitarbeiter_id: anfrage.empfaenger_id,
      datum: e.datum,
      dienst: e.dienst,
      verfuegbar: e.verfuegbar,
      notiz: data.notiz ?? null,
      quelle: `token:${data.token}`,
    }));
    const { error: insErr } = await supabaseAdmin.from("verfuegbarkeiten").insert(rows);
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("anfragen").update({
      status: "beantwortet",
      beantwortet_am: new Date().toISOString(),
    }).eq("id", anfrage.id);

    return { ok: true, anzahl: rows.length };
  });

export const submitBedarf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(8).max(64).regex(/^[a-z0-9]+$/),
      eintraege: z.array(z.object({
        datum: z.string(),
        dienst: z.enum(["F", "S", "N"]),
        anzahl: z.number().int().min(1).max(20),
        qualifikation: z.enum(["PFK", "PHK"]),
      })).min(1).max(500),
      notiz: z.string().max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: anfrage, error } = await supabaseAdmin
      .from("anfragen").select("*").eq("token", data.token).single();
    if (error || !anfrage) throw new Error("Ungültiger Link");
    if (new Date(anfrage.ablauf_datum) < new Date()) throw new Error("Link abgelaufen");
    if (anfrage.empfaenger_typ !== "einrichtung") throw new Error("Falscher Linktyp");

    await supabaseAdmin.from("bedarfe").delete()
      .eq("einrichtung_id", anfrage.empfaenger_id)
      .gte("datum", anfrage.zeitraum_von)
      .lte("datum", anfrage.zeitraum_bis)
      .eq("quelle", `token:${data.token}`);

    const rows = data.eintraege.map((e) => ({
      einrichtung_id: anfrage.empfaenger_id,
      datum: e.datum,
      dienst: e.dienst,
      anzahl: e.anzahl,
      qualifikation: e.qualifikation,
      notiz: data.notiz ?? null,
      quelle: `token:${data.token}`,
    }));
    const { error: insErr } = await supabaseAdmin.from("bedarfe").insert(rows);
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("anfragen").update({
      status: "beantwortet",
      beantwortet_am: new Date().toISOString(),
    }).eq("id", anfrage.id);

    return { ok: true, anzahl: rows.length };
  });
