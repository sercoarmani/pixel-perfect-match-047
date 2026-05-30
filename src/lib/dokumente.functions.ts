import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "mitarbeiter-dokumente";
const DOKUMENT_TYPEN = ["zertifikat", "fuehrungszeugnis", "profil", "sonstiges"] as const;

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "datei";
}

// ---------- Liste pro Mitarbeiter ----------
export const listDokumente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mitarbeiter_id: string }) =>
    z.object({ mitarbeiter_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .select("*")
      .eq("mitarbeiter_id", data.mitarbeiter_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Signed Upload URL ----------
export const createSignedUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mitarbeiter_id: z.string().uuid(),
      filename: z.string().min(1).max(255),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const path = `${data.mitarbeiter_id}/${crypto.randomUUID()}-${safeFilename(data.filename)}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

// ---------- Eintrag nach Upload anlegen ----------
export const registerDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mitarbeiter_id: z.string().uuid(),
      typ: z.enum(DOKUMENT_TYPEN).default("sonstiges"),
      datei_path: z.string().min(1),
      dateiname: z.string().min(1).max(255),
      mime_type: z.string().max(255).nullable().optional(),
      groesse_bytes: z.number().int().nonnegative().nullable().optional(),
      weitergabe_erlaubt: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .insert({
        mitarbeiter_id: data.mitarbeiter_id,
        typ: data.typ,
        datei_path: data.datei_path,
        dateiname: data.dateiname,
        mime_type: data.mime_type ?? null,
        groesse_bytes: data.groesse_bytes ?? null,
        weitergabe_erlaubt: data.weitergabe_erlaubt,
        hochgeladen_von: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Download URL ----------
export const getDokumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .select("datei_path,dateiname")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: signed, error: se } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.datei_path, 300, { download: row.dateiname });
    if (se) throw new Error(se.message);
    return { url: signed.signedUrl };
  });

// ---------- Update (Typ/Daten/Freigabe/geprüft) ----------
export const updateDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      typ: z.enum(DOKUMENT_TYPEN).optional(),
      ausstellungsdatum: z.string().nullable().optional(),
      ablaufdatum: z.string().nullable().optional(),
      weitergabe_erlaubt: z.boolean().optional(),
      erkannt_geprueft: z.boolean().optional(),
      notiz: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    const { data: row, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .update(clean as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;

  });

// ---------- Löschen ----------
export const deleteDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .select("datei_path")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.storage.from(BUCKET).remove([row.datei_path]);
    const { error: de } = await context.supabase
      .from("mitarbeiter_dokumente")
      .delete()
      .eq("id", data.id);
    if (de) throw new Error(de.message);
    return { ok: true };
  });

// ---------- Ablaufende Dokumente (Dashboard / Verwaltung) ----------
export const listExpiringDokumente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ tage: z.number().int().min(1).max(365).default(60) }).parse(input ?? { tage: 60 }),
  )
  .handler(async ({ data, context }) => {
    const heute = new Date().toISOString().slice(0, 10);
    const limit = new Date();
    limit.setDate(limit.getDate() + data.tage);
    const bis = limit.toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("mitarbeiter_dokumente")
      .select("id, mitarbeiter_id, typ, dateiname, ablaufdatum, mitarbeiter:mitarbeiter_id(vorname,nachname,kuerzel)")
      .not("ablaufdatum", "is", null)
      .lte("ablaufdatum", bis)
      .gte("ablaufdatum", heute)
      .order("ablaufdatum");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- KI-Extraktion ----------
type Erkannt = {
  ausstellungsdatum: string | null;
  ablaufdatum: string | null;
  aussteller: string | null;
  betreff: string | null;
  person_name: string | null;
  zusammenfassung: string | null;
  vorgeschlagener_typ: typeof DOKUMENT_TYPEN[number] | null;
};

async function extractWithAi(args: {
  apiKey: string;
  mime: string;
  dataUrl: string;
  dateiname: string;
}): Promise<Erkannt> {
  const system = `Du analysierst hochgeladene Dokumente (Pflege-/Personalkontext: Zertifikate, Führungszeugnisse, Profile, Kursnachweise).
Gib NUR über das Tool 'doc_extract' strukturierte Felder zurück.
Datumsangaben strikt im Format YYYY-MM-DD. Wenn ein Feld nicht eindeutig erkennbar ist: null.
Vorgeschlagener Typ: zertifikat | fuehrungszeugnis | profil | sonstiges.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: `Dateiname: ${args.dateiname}\nExtrahiere die wichtigsten Felder.` },
            { type: "image_url", image_url: { url: args.dataUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "doc_extract",
            description: "Strukturierte Felder aus einem Dokument.",
            parameters: {
              type: "object",
              properties: {
                ausstellungsdatum: { type: ["string", "null"] },
                ablaufdatum: { type: ["string", "null"] },
                aussteller: { type: ["string", "null"] },
                betreff: { type: ["string", "null"], description: "Kurzer Titel/Thema des Dokuments" },
                person_name: { type: ["string", "null"], description: "Vollständiger Name der Person" },
                zusammenfassung: { type: ["string", "null"], description: "Max. 280 Zeichen" },
                vorgeschlagener_typ: { type: ["string", "null"], enum: ["zertifikat","fuehrungszeugnis","profil","sonstiges", null] },
              },
              required: ["ausstellungsdatum","ablaufdatum","aussteller","betreff","person_name","zusammenfassung","vorgeschlagener_typ"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "doc_extract" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("KI-Limit erreicht, bitte kurz warten.");
    if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht. Bitte in Workspace > Usage aufladen.");
    throw new Error(`KI-Fehler [${res.status}]: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("KI hat keine Felder erkannt.");
  return JSON.parse(call.function.arguments);
}

export const extractDokument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ist nicht konfiguriert.");

    const { data: doc, error } = await supabase
      .from("mitarbeiter_dokumente")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const mime = (doc.mime_type ?? "").toLowerCase();
    const isPdf = mime.includes("pdf");
    const isImage = mime.startsWith("image/");
    if (!isPdf && !isImage) {
      const note = "Automatische Texterkennung für diesen Dateityp noch nicht unterstützt – bitte Felder manuell prüfen.";
      await supabase.from("mitarbeiter_dokumente").update({
        erkannt_status: "fehler",
        erkannt_fehler: note,
      }).eq("id", data.id);
      return { ok: false, message: note };
    }

    try {
      const { data: blob, error: de } = await supabase.storage.from(BUCKET).download(doc.datei_path);
      if (de || !blob) throw new Error(de?.message ?? "Datei konnte nicht geladen werden.");
      const buf = new Uint8Array(await blob.arrayBuffer());
      // Base64 encode
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const dataUrl = `data:${mime};base64,${b64}`;

      const erkannt = await extractWithAi({
        apiKey,
        mime,
        dataUrl,
        dateiname: doc.dateiname,
      });

      const patch: Record<string, unknown> = {
        erkannt_json: erkannt,
        erkannt_status: "ok",
        erkannt_fehler: null,
        erkannt_geprueft: false, // muss bestätigt werden
      };
      // Felder NUR vorbelegen, wenn noch leer (nie ungeprüft überschreiben)
      if (!doc.ausstellungsdatum && erkannt.ausstellungsdatum) patch.ausstellungsdatum = erkannt.ausstellungsdatum;
      if (!doc.ablaufdatum && erkannt.ablaufdatum) patch.ablaufdatum = erkannt.ablaufdatum;
      if (doc.typ === "sonstiges" && erkannt.vorgeschlagener_typ) patch.typ = erkannt.vorgeschlagener_typ;

      const { data: row, error: ue } = await supabase
        .from("mitarbeiter_dokumente")
        .update(patch as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (ue) throw new Error(ue.message);
      return { ok: true, dokument: row };
    } catch (e: any) {
      const msg = e?.message ?? "Unbekannter Fehler";
      await supabase.from("mitarbeiter_dokumente").update({
        erkannt_status: "fehler",
        erkannt_fehler: msg.slice(0, 500),
      }).eq("id", data.id);
      throw new Error(msg);
    }
  });
