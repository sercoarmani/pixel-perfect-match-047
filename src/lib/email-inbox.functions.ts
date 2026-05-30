import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyAndAssignInbox } from "@/lib/email-inbox.server";

const STATUS = ["neu", "zugeordnet", "bedarf_angelegt", "beantwortet", "archiviert", "fehler"] as const;

export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      status: z.enum(STATUS).nullable().optional(),
      mitarbeiter_id: z.string().uuid().nullable().optional(),
      einrichtung_id: z.string().uuid().nullable().optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_inbox")
      .select(
        "id,empfangen_am,von_email,von_name,betreff,status,tags,ai_kategorie,ai_zusammenfassung,zuordnung_confidence,zuordnung_quelle,zugeordnet_einrichtung_id,zugeordnet_mitarbeiter_id,einrichtung:zugeordnet_einrichtung_id(id,name),mitarbeiter:zugeordnet_mitarbeiter_id(id,vorname,nachname,kuerzel),anhaenge",
      )
      .order("empfangen_am", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.einrichtung_id) q = q.eq("zugeordnet_einrichtung_id", data.einrichtung_id);
    if (data.mitarbeiter_id) q = q.eq("zugeordnet_mitarbeiter_id", data.mitarbeiter_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getInboxMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("email_inbox")
      .select(
        "*, einrichtung:zugeordnet_einrichtung_id(id,name,ort), mitarbeiter:zugeordnet_mitarbeiter_id(id,vorname,nachname,kuerzel)",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const assignInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      einrichtung_id: z.string().uuid().nullable().optional(),
      mitarbeiter_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      bearbeitet_von: context.userId,
      bearbeitet_am: new Date().toISOString(),
      zuordnung_quelle: "manuell",
      zuordnung_confidence: 1,
    };
    if (data.einrichtung_id !== undefined) patch.zugeordnet_einrichtung_id = data.einrichtung_id;
    if (data.mitarbeiter_id !== undefined) patch.zugeordnet_mitarbeiter_id = data.mitarbeiter_id;
    if (data.einrichtung_id || data.mitarbeiter_id) patch.status = "zugeordnet";

    const { data: row, error } = await context.supabase
      .from("email_inbox")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setInboxStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(STATUS),
      tags: z.array(z.string().max(40)).max(20).optional(),
      notiz: z.string().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      status: data.status,
      bearbeitet_von: context.userId,
      bearbeitet_am: new Date().toISOString(),
    };
    if (data.tags) patch.tags = data.tags;
    if (data.notiz !== undefined) patch.notiz = data.notiz;
    const { data: row, error } = await context.supabase
      .from("email_inbox")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const reklassifyInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await classifyAndAssignInbox(data.id);
    return { ok: true };
  });

export const deleteInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("email_inbox").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Anlegen eines Bedarfs aus erkannter Mail
export const bedarfAusInboxAnlegen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      einrichtung_id: z.string().uuid(),
      datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dienst: z.enum(["F", "S", "N"]),
      qualifikation: z.enum(["PFK", "PHK"]).default("PFK"),
      anzahl: z.number().int().min(1).max(20).default(1),
      notiz: z.string().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: bedarf, error } = await context.supabase
      .from("bedarfe")
      .insert({
        einrichtung_id: data.einrichtung_id,
        datum: data.datum,
        dienst: data.dienst,
        qualifikation: data.qualifikation,
        anzahl: data.anzahl,
        quelle: "email",
        notiz: data.notiz ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("email_inbox")
      .update({
        status: "bedarf_angelegt",
        bearbeitet_von: context.userId,
        bearbeitet_am: new Date().toISOString(),
        zugeordnet_einrichtung_id: data.einrichtung_id,
      })
      .eq("id", data.id);

    return { ok: true, bedarf_id: bedarf?.id };
  });

// Schlanke Listen für Zuweisungs-Dropdowns
export const listEinrichtungenLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("einrichtungen")
      .select("id,name,ort")
      .eq("aktiv", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMitarbeiterLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mitarbeiter")
      .select("id,vorname,nachname,kuerzel")
      .eq("aktiv", true)
      .order("nachname");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
