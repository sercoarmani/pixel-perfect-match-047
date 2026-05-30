import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VerbindungStatus = "verbunden" | "nicht_verbunden" | "fehler" | "unbekannt";

export interface VerbindungInfo {
  key: string;
  name: string;
  kategorie: "messaging" | "email" | "telefonie" | "api" | "sonstiges";
  beschreibung: string;
  status: VerbindungStatus;
  zuletzt_aktiv: string | null;
  detail: string | null;
  /** Wo der Nutzer die Verbindung verwaltet (z.B. "Connectors", "Cloud → Emails", "Secrets"). */
  verwaltet_in: string;
  konfigurierbar: boolean;
}

export const listVerbindungen = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VerbindungInfo[]> => {
    const { supabase } = context;
    const result: VerbindungInfo[] = [];

    // --- Telegram ---
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgUser = process.env.TELEGRAM_BOT_USERNAME;
    let tgStatus: VerbindungStatus = "nicht_verbunden";
    let tgDetail: string | null = null;
    if (tgToken) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
        const j = await r.json();
        if (j?.ok) {
          tgStatus = "verbunden";
          tgDetail = `@${j.result.username}`;
        } else {
          tgStatus = "fehler";
          tgDetail = j?.description ?? "Bot nicht erreichbar";
        }
      } catch (e) {
        tgStatus = "fehler";
        tgDetail = e instanceof Error ? e.message : "Netzwerkfehler";
      }
    }
    const { data: lastTg } = await supabase
      .from("telegram_updates")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    result.push({
      key: "telegram",
      name: "Telegram-Bot",
      kategorie: "messaging",
      beschreibung: "Mitarbeiter koppeln per Einmal-Code und antworten zu Verfügbarkeiten.",
      status: tgStatus,
      zuletzt_aktiv: lastTg?.created_at ?? null,
      detail: tgDetail ?? (tgUser ? `@${tgUser}` : null),
      verwaltet_in: "Connectors → Telegram",
      konfigurierbar: true,
    });

    // --- E-Mail (Lovable Emails) ---
    const { data: lastMail } = await supabase
      .from("email_send_log")
      .select("created_at,status")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: mailState } = await supabase
      .from("email_send_state")
      .select("id")
      .limit(1)
      .maybeSingle();
    let mailStatus: VerbindungStatus = mailState ? "verbunden" : "nicht_verbunden";
    if (lastMail?.status === "failed" || lastMail?.status === "dlq") mailStatus = "fehler";
    result.push({
      key: "email",
      name: "E-Mail (Lovable Emails)",
      kategorie: "email",
      beschreibung: "Versand von Anfragen, Benachrichtigungen und Auth-Mails über Lovable Cloud.",
      status: mailStatus,
      zuletzt_aktiv: lastMail?.created_at ?? null,
      detail: lastMail ? `letzter Versand: ${lastMail.status}` : null,
      verwaltet_in: "Cloud → Emails",
      konfigurierbar: true,
    });

    // --- WhatsApp ---
    const waConfigured = Boolean(
      process.env.WHATSAPP_TOKEN || process.env.META_WHATSAPP_TOKEN || process.env.TWILIO_AUTH_TOKEN,
    );
    result.push({
      key: "whatsapp",
      name: "WhatsApp",
      kategorie: "messaging",
      beschreibung: "Noch nicht eingerichtet. Provider (Meta Cloud API, 360dialog, Twilio) wird später gewählt.",
      status: waConfigured ? "verbunden" : "nicht_verbunden",
      zuletzt_aktiv: null,
      detail: null,
      verwaltet_in: "Secrets / Connectors",
      konfigurierbar: false,
    });

    // --- Telefon-App ---
    result.push({
      key: "telefon",
      name: "Telefon-App",
      kategorie: "telefonie",
      beschreibung: "Anrufe und SMS-Benachrichtigungen (z.B. via Twilio Voice). Noch nicht eingerichtet.",
      status: "nicht_verbunden",
      zuletzt_aktiv: null,
      detail: null,
      verwaltet_in: "Secrets / Connectors",
      konfigurierbar: false,
    });

    // --- Lovable AI Gateway ---
    result.push({
      key: "lovable_ai",
      name: "Lovable AI (OCR / Extraktion)",
      kategorie: "api",
      beschreibung: "Gemini-basierte Erkennung von Mitarbeiter-Dokumenten.",
      status: process.env.LOVABLE_API_KEY ? "verbunden" : "nicht_verbunden",
      zuletzt_aktiv: null,
      detail: "Modell: gemini-2.5-flash",
      verwaltet_in: "Lovable Cloud",
      konfigurierbar: false,
    });

    return result;
  });
