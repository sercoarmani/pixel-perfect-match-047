import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
