import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Admin: Token erzeugen ----------
export const generatePortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ einrichtung_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { error } = await supabase
      .from("einrichtungen")
      .update({ portal_token: token })
      .eq("id", data.einrichtung_id);
    if (error) throw new Error(error.message);
    return { token };
  });

// ---------- Public: Einrichtung per Token laden ----------
export const getPortalEinrichtung = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(10).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("einrichtungen")
      .select("id, name, ort, wohnbereich")
      .eq("portal_token", data.token)
      .eq("aktiv", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ungültiger oder abgelaufener Link");
    return row;
  });

// ---------- Public: Bedarf einreichen ----------
export const createBedarfFromPortal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(10).max(200),
      eintraege: z.array(z.object({
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dienst: z.enum(["F", "S", "N"]),
        qualifikation: z.enum(["PFK", "PHK"]),
        anzahl: z.number().int().min(1).max(20),
        notiz: z.string().max(500).optional().nullable(),
      })).min(1).max(60),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: ein, error: e1 } = await supabaseAdmin
      .from("einrichtungen")
      .select("id, name")
      .eq("portal_token", data.token)
      .eq("aktiv", true)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!ein) throw new Error("Ungültiger Link");

    const rows = data.eintraege.map((e) => ({
      einrichtung_id: ein.id,
      datum: e.datum,
      dienst: e.dienst,
      qualifikation: e.qualifikation,
      anzahl: e.anzahl,
      notiz: e.notiz ?? null,
      quelle: "kundenportal",
      status: "offen" as const,
    }));
    const { error: e2 } = await supabaseAdmin.from("bedarfe").insert(rows);
    if (e2) throw new Error(e2.message);

    await supabaseAdmin.from("audit_log").insert({
      objekt_typ: "bedarf",
      neuer_status: "offen",
      detail: { quelle: "kundenportal", einrichtung: ein.name, anzahl: rows.length },
    });

    return { count: rows.length, einrichtung: ein.name };
  });
