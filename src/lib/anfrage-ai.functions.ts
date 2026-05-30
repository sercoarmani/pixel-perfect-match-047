import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  qualErfuellt, dienstMoeglich, maEinplanbar,
  ANSTELLUNG_RANK, qualRank,
} from "@/lib/matching";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function randomTokenStr(len = 24) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}


// ============================================================
// AI: parst E-Mail-/Freitext zu strukturierten Bedarfen
// ============================================================
export const parseAnfrageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      text: z.string().min(5).max(20000),
      hint_jahr: z.number().int().min(2024).max(2099).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ist nicht konfiguriert.");

    // Einrichtungen aus DB für Matching vorladen
    const { data: eins } = await context.supabase
      .from("einrichtungen")
      .select("id,name,ort")
      .eq("aktiv", true);
    const einsListe = (eins ?? []).map((e) => `- ${e.name}${e.ort ? ` (${e.ort})` : ""}`).join("\n");

    const heute = new Date();
    const jahr = data.hint_jahr ?? heute.getFullYear();

    const sys = `Du extrahierst Pflege-Dienstanfragen aus deutschen E-Mails/Texten in strukturiertes JSON.
Schichten: F=Frühdienst, S=Spätdienst, N=Nachtdienst.
Qualifikationen: PFK (Pflegefachkraft), PHK (Pflegehilfskraft).
Datumsformate immer als YYYY-MM-DD. Wenn Jahr fehlt: ${jahr}.
Bei Zeitraum ("vom 03.05 bis 05.05") erzeuge eine Zeile pro Tag.
Bei "Wochenende" verwende Sa+So. Anzahl default 1.
Liefere NUR über das Tool ab. Wenn keine Anfrage erkennbar: leeres Array.`;

    const einsPrompt = einsListe
      ? `\n\nBekannte Einrichtungen (matche, falls möglich):\n${einsListe}`
      : "";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys + einsPrompt },
          { role: "user", content: data.text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_bedarfe",
              description: "Liefert erkannte Dienstanfragen.",
              parameters: {
                type: "object",
                properties: {
                  einrichtung_name: { type: "string", description: "Name der Einrichtung (best match)" },
                  bedarfe: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        datum: { type: "string", description: "YYYY-MM-DD" },
                        dienst: { type: "string", enum: ["F", "S", "N"] },
                        qualifikation: { type: "string", enum: ["PFK", "PHK"] },
                        anzahl: { type: "number" },
                        notiz: { type: "string" },
                      },
                      required: ["datum", "dienst", "qualifikation", "anzahl"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["bedarfe"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_bedarfe" } },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("KI-Limit erreicht, bitte kurz warten.");
      if (res.status === 402) throw new Error("KI-Guthaben aufgebraucht. Bitte in Workspace > Usage aufladen.");
      throw new Error(`KI-Fehler [${res.status}]: ${t}`);
    }
    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return { einrichtung_name: null, bedarfe: [] as any[], matched_einrichtung_id: null };
    let parsed: { einrichtung_name?: string; bedarfe: any[] } = { bedarfe: [] };
    try { parsed = JSON.parse(call.function.arguments); } catch {}

    // Versuche Einrichtung zu matchen
    let matched_id: string | null = null;
    if (parsed.einrichtung_name) {
      const needle = parsed.einrichtung_name.toLowerCase();
      const found = (eins ?? []).find(
        (e) => e.name.toLowerCase().includes(needle) || needle.includes(e.name.toLowerCase()),
      );
      if (found) matched_id = found.id;
    }

    return {
      einrichtung_name: parsed.einrichtung_name ?? null,
      bedarfe: parsed.bedarfe ?? [],
      matched_einrichtung_id: matched_id,
    };
  });

// ============================================================
// Verfügbare Mitarbeiter pro Bedarf vorschlagen
// ============================================================
export const getVerfuegbareMitarbeiter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      datum: z.string(),
      dienst: z.enum(["F", "S", "N"]),
      qualifikation: z.enum(["PFK", "PHK"]).optional(),
      einrichtung_id: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const monatStart = data.datum.slice(0, 8) + "01";
    const d = new Date(monatStart);
    const monatEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

    const einPromise = data.einrichtung_id
      ? supabase.from("einrichtungen").select("id,lat,lng,name,ort").eq("id", data.einrichtung_id).maybeSingle()
      : Promise.resolve({ data: null } as any);

    const [mitR, abwR, einR, einrichtungR] = await Promise.all([
      supabase.from("mitarbeiter").select("*").eq("aktiv", true),
      supabase.from("abwesenheiten").select("mitarbeiter_id,datum").eq("datum", data.datum),
      supabase
        .from("einsaetze")
        .select("mitarbeiter_id,datum,einrichtung_id,dienst")
        .gte("datum", monatStart)
        .lte("datum", monatEnd),
      einPromise,
    ]);

    const einrichtung = (einrichtungR as any)?.data ?? null;
    const einLat = einrichtung?.lat != null ? Number(einrichtung.lat) : null;
    const einLng = einrichtung?.lng != null ? Number(einrichtung.lng) : null;

    const abwSet = new Set((abwR.data ?? []).map((a: any) => a.mitarbeiter_id));
    const monatCount = new Map<string, number>();
    const tagBelegt = new Set<string>();
    for (const e of einR.data ?? []) {
      monatCount.set(e.mitarbeiter_id, (monatCount.get(e.mitarbeiter_id) ?? 0) + 1);
      if (e.datum === data.datum) tagBelegt.add(e.mitarbeiter_id);
    }

    const vorschlaege = (mitR.data ?? [])
      .filter((m: any) => maEinplanbar(m))
      .filter((m: any) => !data.qualifikation || qualErfuellt(m.qualifikation, data.qualifikation))
      .filter((m: any) => dienstMoeglich(m.dienste_moeglich, data.dienst))
      .filter((m: any) => !abwSet.has(m.id))
      .filter((m: any) => !tagBelegt.has(m.id))
      .map((m: any) => {
        const eingeplant = monatCount.get(m.id) ?? 0;
        const frei = Math.max(0, (m.max_einsaetze ?? 20) - eingeplant);
        let distanz_km: number | null = null;
        let im_radius: boolean | null = null;
        if (einLat != null && einLng != null && m.lat != null && m.lng != null) {
          distanz_km = Math.round(haversineKm({ lat: einLat, lng: einLng }, { lat: Number(m.lat), lng: Number(m.lng) }) * 10) / 10;
          const radius = m.max_radius_km ?? m.umkreis_km ?? null;
          if (radius != null) im_radius = distanz_km <= Number(radius);
        }
        return { ...m, eingeplant, frei, distanz_km, im_radius };
      })
      .filter((m: any) => m.frei > 0)
      .sort((a: any, b: any) => {
        // 1. innerhalb Radius zuerst
        if (a.im_radius !== b.im_radius) {
          if (a.im_radius === true) return -1;
          if (b.im_radius === true) return 1;
        }
        // 2. nach Distanz (wenn vorhanden)
        if (a.distanz_km != null && b.distanz_km != null) {
          if (a.distanz_km !== b.distanz_km) return a.distanz_km - b.distanz_km;
        } else if (a.distanz_km != null) return -1;
        else if (b.distanz_km != null) return 1;
        // 3. Qualifikation
        const qa = qualRank(a.qualifikation);
        const qb = qualRank(b.qualifikation);
        if (qa !== qb) return qa - qb;
        // 4. Anstellung
        const aa = ANSTELLUNG_RANK[a.anstellung] ?? 9;
        const ab = ANSTELLUNG_RANK[b.anstellung] ?? 9;
        if (aa !== ab) return aa - ab;
        return b.frei - a.frei;
      });

    return { vorschlaege, einrichtung_geocoded: einLat != null && einLng != null };
  });


// ============================================================
// Bedarfe in Planungsmatrix übernehmen
// ============================================================
export const createBedarfeBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      einrichtung_id: z.string().uuid(),
      bedarfe: z.array(
        z.object({
          datum: z.string(),
          dienst: z.enum(["F", "S", "N"]),
          qualifikation: z.enum(["PFK", "PHK"]),
          anzahl: z.number().int().min(1).max(20),
          notiz: z.string().optional().nullable(),
        }),
      ).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const rows = data.bedarfe.map((b) => ({
      einrichtung_id: data.einrichtung_id,
      datum: b.datum,
      dienst: b.dienst,
      qualifikation: b.qualifikation,
      anzahl: b.anzahl,
      notiz: b.notiz ?? null,
      quelle: "ki-import",
      status: "offen" as const,
    }));
    const { error } = await context.supabase.from("bedarfe").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });
