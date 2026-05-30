import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendKundenbestaetigung } from "@/lib/kunden-bestaetigung.server";

export const listKundenbestaetigungen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      status: z.enum(["entwurf", "gesendet", "fehler", "alle"]).default("entwurf"),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("kunden_bestaetigungen")
      .select("id, status, betreff, empfaenger_name, empfaenger_email, mitarbeiter_id, einrichtung_id, bedarf_id, einsatz_id, dokument_ids, gesendet_am, fehler, ma_unterlagen_status, ma_unterlagen_fehler, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "alle") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const maIds = Array.from(new Set((rows ?? []).map((r) => r.mitarbeiter_id)));
    const einIds = Array.from(new Set((rows ?? []).map((r) => r.einrichtung_id)));
    const [{ data: mas }, { data: eins }] = await Promise.all([
      maIds.length
        ? context.supabase.from("mitarbeiter").select("id, vorname, nachname, qualifikation, telegram_chat_id").in("id", maIds)
        : Promise.resolve({ data: [] as any[] }),
      einIds.length
        ? context.supabase.from("einrichtungen").select("id, name, ort").in("id", einIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const maMap = new Map((mas ?? []).map((m: any) => [m.id, m]));
    const einMap = new Map((eins ?? []).map((e: any) => [e.id, e]));
    return (rows ?? []).map((r) => ({
      ...r,
      mitarbeiter: maMap.get(r.mitarbeiter_id) ?? null,
      einrichtung: einMap.get(r.einrichtung_id) ?? null,
    }));
  });

export const getKundenbestaetigung = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("kunden_bestaetigungen").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Nicht gefunden");

    const [{ data: ma }, { data: ein }, { data: dokumente }, { data: einsatz }] = await Promise.all([
      context.supabase.from("mitarbeiter").select("id, vorname, nachname, qualifikation, telegram_chat_id").eq("id", row.mitarbeiter_id).maybeSingle(),
      context.supabase.from("einrichtungen").select("id, name, ort, kontakt_name, kontakt_email").eq("id", row.einrichtung_id).maybeSingle(),
      context.supabase
        .from("mitarbeiter_dokumente")
        .select("id, dateiname, typ, mime_type, groesse_bytes, weitergabe_erlaubt, ablaufdatum")
        .eq("mitarbeiter_id", row.mitarbeiter_id)
        .eq("weitergabe_erlaubt", true)
        .order("typ", { ascending: true }),
      row.einsatz_id
        ? context.supabase.from("einsaetze").select("datum, dienst").eq("id", row.einsatz_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    return {
      bestaetigung: row,
      mitarbeiter: ma,
      einrichtung: ein,
      verfuegbare_dokumente: dokumente ?? [],
      einsatz: einsatz ?? null,
    };
  });

export const updateKundenbestaetigung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      empfaenger_email: z.string().email().nullable().optional(),
      empfaenger_name: z.string().max(255).nullable().optional(),
      betreff: z.string().min(1).max(500).optional(),
      body_text: z.string().min(1).max(20000).optional(),
      dokument_ids: z.array(z.string().uuid()).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      empfaenger_email?: string | null;
      empfaenger_name?: string | null;
      betreff?: string;
      body_text?: string;
      dokument_ids?: string[];
    } = {};
    if (data.empfaenger_email !== undefined) patch.empfaenger_email = data.empfaenger_email;
    if (data.empfaenger_name !== undefined) patch.empfaenger_name = data.empfaenger_name;
    if (data.betreff !== undefined) patch.betreff = data.betreff;
    if (data.body_text !== undefined) patch.body_text = data.body_text;
    if (data.dokument_ids !== undefined) patch.dokument_ids = data.dokument_ids;
    const { data: row, error } = await context.supabase
      .from("kunden_bestaetigungen").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });


export const versendeKundenbestaetigung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await sendKundenbestaetigung(data.id, context.userId);
    return result;
  });

export const verwerfeKundenbestaetigung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("kunden_bestaetigungen").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
