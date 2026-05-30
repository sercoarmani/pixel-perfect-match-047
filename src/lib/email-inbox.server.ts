// Server-only Helfer für die automatische Zuordnung & KI-Klassifikation
// eingehender E-Mails. Verwendet den Admin-Client (Service Role).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AiExtrakt = {
  kategorie:
    | "bedarf"
    | "rueckmeldung_mitarbeiter"
    | "bewerbung"
    | "dokument"
    | "rechnung"
    | "frage"
    | "spam"
    | "sonstiges";
  zusammenfassung: string | null;
  tags: string[];
  vorgeschlagener_status:
    | "neu"
    | "zugeordnet"
    | "bedarf_angelegt"
    | "beantwortet"
    | "archiviert"
    | "fehler";
  hinweis_kunde: string | null;
  hinweis_mitarbeiter: string | null;
  bedarf?: {
    datum: string | null;
    schicht: "F" | "S" | "N" | null;
    qualifikation: string | null;
    anzahl: number | null;
  } | null;
};

function normalizeDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function matchEinrichtung(email: {
  von_email: string;
  von_name: string | null;
  betreff: string | null;
  body_text: string | null;
}): Promise<{ id: string; quelle: string; confidence: number } | null> {
  const { data: einrichtungen } = await supabaseAdmin
    .from("einrichtungen")
    .select("id,name,ort,kontakt_email,kontakt_name");
  if (!einrichtungen?.length) return null;

  // 1) Exakter Kontakt-E-Mail-Treffer
  const lowerFrom = email.von_email.toLowerCase();
  const exact = einrichtungen.find(
    (e) => (e.kontakt_email ?? "").toLowerCase() === lowerFrom,
  );
  if (exact) return { id: exact.id, quelle: "kontakt_email", confidence: 0.99 };

  // 2) Domain-Match (außer großen Free-Maildomains)
  const freeDomains = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "gmx.de", "gmx.net",
    "web.de", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "icloud.com", "t-online.de",
  ]);
  const fromDomain = normalizeDomain(lowerFrom);
  if (!freeDomains.has(fromDomain)) {
    const domainHit = einrichtungen.find((e) => {
      const ke = (e.kontakt_email ?? "").toLowerCase();
      return ke && normalizeDomain(ke) === fromDomain;
    });
    if (domainHit) return { id: domainHit.id, quelle: "domain", confidence: 0.85 };
  }

  // 3) Name im Betreff/Body
  const hay = normalize(`${email.betreff ?? ""} ${email.body_text ?? ""} ${email.von_name ?? ""}`);
  if (hay) {
    let best: { id: string; score: number } | null = null;
    for (const e of einrichtungen) {
      const n = normalize(e.name);
      if (n.length < 4) continue;
      if (hay.includes(n)) {
        const score = n.length; // längerer Name = sicherer
        if (!best || score > best.score) best = { id: e.id, score };
      }
    }
    if (best) return { id: best.id, quelle: "name_im_text", confidence: 0.7 };
  }
  return null;
}

async function matchMitarbeiter(email: {
  von_email: string;
  von_name: string | null;
  betreff: string | null;
  body_text: string | null;
}): Promise<{ id: string; quelle: string; confidence: number } | null> {
  const { data: mas } = await supabaseAdmin
    .from("mitarbeiter")
    .select("id,vorname,nachname,kuerzel,email")
    .eq("aktiv", true);
  if (!mas?.length) return null;

  const lowerFrom = email.von_email.toLowerCase();
  const exact = mas.find((m) => (m.email ?? "").toLowerCase() === lowerFrom);
  if (exact) return { id: exact.id, quelle: "mitarbeiter_email", confidence: 0.99 };

  const hay = normalize(`${email.betreff ?? ""} ${email.body_text ?? ""} ${email.von_name ?? ""}`);
  if (!hay) return null;

  let best: { id: string; score: number } | null = null;
  for (const m of mas) {
    const full = normalize(`${m.vorname} ${m.nachname}`);
    if (full.length >= 5 && hay.includes(full)) {
      const score = full.length + 5;
      if (!best || score > best.score) best = { id: m.id, score };
      continue;
    }
    const k = normalize(m.kuerzel);
    if (k.length >= 3 && hay.includes(` ${k} `)) {
      if (!best || k.length > best.score) best = { id: m.id, score: k.length };
    }
  }
  return best ? { id: best.id, quelle: "name_im_text", confidence: 0.7 } : null;
}

async function aiClassify(email: {
  von_email: string;
  von_name: string | null;
  betreff: string | null;
  body_text: string | null;
}): Promise<AiExtrakt | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const system = `Du analysierst eingehende E-Mails an eine Pflege-Disposition.
Mögliche Kategorien:
- bedarf: Kunde/Einrichtung meldet einen Personalbedarf (Datum, Schicht F/S/N, Qualifikation)
- rueckmeldung_mitarbeiter: Mitarbeiter meldet Verfügbarkeit, Krankheit, Abwesenheit
- bewerbung
- dokument: Anhänge (Zertifikate, Führungszeugnis, Profil)
- rechnung
- frage
- spam
- sonstiges
Gib NUR über das Tool 'inbox_classify' strukturiert zurück.`;

  const userText = `Absender: ${email.von_name ?? ""} <${email.von_email}>
Betreff: ${email.betreff ?? ""}
---
${(email.body_text ?? "").slice(0, 8000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "inbox_classify",
            description: "Strukturierte Klassifikation einer eingehenden E-Mail.",
            parameters: {
              type: "object",
              properties: {
                kategorie: {
                  type: "string",
                  enum: ["bedarf", "rueckmeldung_mitarbeiter", "bewerbung", "dokument", "rechnung", "frage", "spam", "sonstiges"],
                },
                zusammenfassung: { type: ["string", "null"], description: "Max 280 Zeichen" },
                tags: { type: "array", items: { type: "string" }, maxItems: 8 },
                vorgeschlagener_status: {
                  type: "string",
                  enum: ["neu", "zugeordnet", "bedarf_angelegt", "beantwortet", "archiviert", "fehler"],
                },
                hinweis_kunde: { type: ["string", "null"], description: "Name der Einrichtung falls erkennbar" },
                hinweis_mitarbeiter: { type: ["string", "null"], description: "Name des Mitarbeiters falls erkennbar" },
                bedarf: {
                  type: ["object", "null"],
                  properties: {
                    datum: { type: ["string", "null"], description: "YYYY-MM-DD" },
                    schicht: { type: ["string", "null"], enum: ["F", "S", "N", null] },
                    qualifikation: { type: ["string", "null"] },
                    anzahl: { type: ["integer", "null"] },
                  },
                  required: ["datum", "schicht", "qualifikation", "anzahl"],
                  additionalProperties: false,
                },
              },
              required: ["kategorie", "zusammenfassung", "tags", "vorgeschlagener_status", "hinweis_kunde", "hinweis_mitarbeiter", "bedarf"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "inbox_classify" } },
    }),
  });

  if (!res.ok) {
    console.error("[email-inbox] AI error", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try {
    return JSON.parse(call.function.arguments) as AiExtrakt;
  } catch {
    return null;
  }
}

export async function classifyAndAssignInbox(id: string): Promise<void> {
  const { data: mail, error } = await supabaseAdmin
    .from("email_inbox")
    .select("id,von_email,von_name,betreff,body_text,zugeordnet_einrichtung_id,zugeordnet_mitarbeiter_id")
    .eq("id", id)
    .single();
  if (error || !mail) return;

  try {
    const [einrichtung, mitarbeiter, ai] = await Promise.all([
      matchEinrichtung(mail),
      matchMitarbeiter(mail),
      aiClassify(mail),
    ]);

    const tags = new Set<string>();
    if (ai?.tags) for (const t of ai.tags) if (t) tags.add(t.toLowerCase().slice(0, 40));
    if (ai?.kategorie) tags.add(ai.kategorie);
    if (einrichtung) tags.add("kunde-erkannt");
    if (mitarbeiter) tags.add("mitarbeiter-erkannt");

    // Bevorzuge die eindeutigere Zuordnung. Wenn AI-Hinweis vorhanden ist
    // und Heuristik nichts findet → Heuristik bleibt null (manueller Schritt).
    const status: "neu" | "zugeordnet" = (einrichtung || mitarbeiter) ? "zugeordnet" : "neu";

    await supabaseAdmin
      .from("email_inbox")
      .update({
        zugeordnet_einrichtung_id: mail.zugeordnet_einrichtung_id ?? einrichtung?.id ?? null,
        zugeordnet_mitarbeiter_id: mail.zugeordnet_mitarbeiter_id ?? mitarbeiter?.id ?? null,
        zuordnung_confidence: Math.max(einrichtung?.confidence ?? 0, mitarbeiter?.confidence ?? 0) || null,
        zuordnung_quelle: [einrichtung?.quelle, mitarbeiter?.quelle].filter(Boolean).join("+") || null,
        ai_kategorie: ai?.kategorie ?? null,
        ai_zusammenfassung: ai?.zusammenfassung ?? null,
        ai_extrakt: (ai as never) ?? null,
        tags: Array.from(tags),
        status,
      })
      .eq("id", id);
  } catch (e: any) {
    await supabaseAdmin
      .from("email_inbox")
      .update({ status: "fehler", notiz: `Auto-Zuordnung Fehler: ${e?.message ?? e}`.slice(0, 500) })
      .eq("id", id);
  }
}
