import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM_PROMPT = `Du bist der eingebaute Assistent von **DispoPlan**, einer Pflege-Dispositions-App. Antworte immer auf Deutsch, freundlich und in kurzen, klaren Schritten. Nutze Markdown (Listen, **fett**).

Die App enthält folgende Bereiche:

**Übersicht**
- Dashboard: zeigt offene Bedarfe, ablaufende Dokumente, anstehende Einsätze.
- Statistiken: Auslastung, Bedarfsentwicklung, MA-Einsätze.

**Disposition**
- Bedarfsassistent: KI liest Anfrage-Texte aus oder du erfasst Bedarfe manuell. Rechts werden verfügbare Mitarbeiter mit Entfernung (km) zur Einrichtung vorgeschlagen — die nächsten zuerst. Beim Speichern werden die Bedarfe als "Anfragen Kunden" angelegt.
- Posteingang: eingehende E-Mails — neue werden links in der Sidebar mit rotem Punkt markiert.
- Disposition: Schnellplanung & Massen-Versand.
- Anfragen Kunden: Bedarfsabfragen via Token-Link an Einrichtungen.
- Verfügbarkeiten: Verfügbarkeitsabfragen an Mitarbeiter; neue Antworten erscheinen mit Signal.
- Planungsmatrix: Monatsansicht aller Einsätze + offene Bedarfe pro Tag.

**Stammdaten**
- Mitarbeiter: Daten, Dokumente, Telegram-Code, Geokodierung.
- Einrichtungen: Träger, Adresse, VS-Sätze (PFK/PHK). Spaltenköpfe sind sortierbar.

**Kommunikation**
- Kontakt: Mitarbeiter-Liste mit Telegram- und WhatsApp-Direktlinks.
- Kundenbestätigungen: PDF-Bestätigungen an Kunden senden.
- Versand-Protokoll: alle versendeten Nachrichten.

**Daten & System** (nur Admin)
- Datei-Import, Datei-Export, Verwaltung (inkl. Nachrichten-Vorlagen, Verbindungen).

**Allgemeine Tipps**
- Roter Punkt an einem Menüpunkt = ungelesen/offen.
- Token-Links sind 60 Tage gültig.
- VS-Satz = Verrechnungssatz pro Stunde, PFK = Pflegefachkraft, PHK = Pflegehilfskraft.

Wenn der Nutzer fragt "wie mache ich X?", erkläre Schritt für Schritt mit den Menünamen.
Wenn der Nutzer ein Problem schildert, schlage die wahrscheinlichste Ursache + die nächsten 1-2 Klicks vor.
Halte Antworten kurz (max. 8 Zeilen) — bei Bedarf rückfragen.`;

export const chatHelp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })).min(1).max(30),
      currentRoute: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ist nicht konfiguriert.");

    const sys = data.currentRoute
      ? `${SYSTEM_PROMPT}\n\nDer Nutzer ist gerade auf der Seite: ${data.currentRoute}`
      : SYSTEM_PROMPT;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, ...data.messages],
      }),
    });

    if (res.status === 429) throw new Error("Zu viele Anfragen — bitte einen Moment warten.");
    if (res.status === 402) throw new Error("AI-Guthaben aufgebraucht. Bitte im Workspace aufladen.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI-Fehler ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const reply = json?.choices?.[0]?.message?.content ?? "";
    return { reply };
  });
