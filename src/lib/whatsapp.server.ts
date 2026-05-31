// Low-level WhatsApp send helpers – server-only.
// Twilio läuft über den Lovable Connector-Gateway, Meta direkt gegen die Graph-API.

import { normalizePhoneE164 } from "./whatsapp-utils";

export type WhatsAppProvider = "twilio" | "meta";

export interface WhatsAppSendInput {
  to: string; // E.164 mit oder ohne '+'
  body?: string; // Freitext (nur 24h-Fenster / Sandbox)
  template?: {
    template_name: string; // bei Meta: Name; bei Twilio: Content SID (HX...)
    language_code: string; // z.B. "de"
    variables: string[]; // Reihenfolge entspricht {{1}}, {{2}}, ...
  };
}

export interface WhatsAppSendResult {
  ok: boolean;
  message_id?: string;
  error?: string;
  raw?: unknown;
}

const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
const META_GRAPH = "https://graph.facebook.com/v21.0";

async function sendViaTwilio(input: WhatsAppSendInput, from: string): Promise<WhatsAppSendResult> {
  const lov = process.env.LOVABLE_API_KEY;
  const tw = process.env.TWILIO_API_KEY;
  if (!lov) return { ok: false, error: "LOVABLE_API_KEY fehlt" };
  if (!tw) return { ok: false, error: "TWILIO_API_KEY fehlt – Twilio-Connector verbinden" };
  if (!from) return { ok: false, error: "Twilio-Absender (From) nicht konfiguriert" };

  const toFmt = `whatsapp:+${normalizePhoneE164(input.to)}`;
  const fromFmt = from.startsWith("whatsapp:") ? from : `whatsapp:${from.startsWith("+") ? from : "+" + from}`;

  const body = new URLSearchParams({ To: toFmt, From: fromFmt });

  if (input.template) {
    body.set("ContentSid", input.template.template_name);
    if (input.template.variables.length > 0) {
      const vars: Record<string, string> = {};
      input.template.variables.forEach((v, i) => (vars[String(i + 1)] = v));
      body.set("ContentVariables", JSON.stringify(vars));
    }
  } else if (input.body) {
    body.set("Body", input.body);
  } else {
    return { ok: false, error: "Weder Text noch Template angegeben" };
  }

  const res = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lov}`,
      "X-Connection-Api-Key": tw,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.message || `Twilio ${res.status}`, raw: data };
  return { ok: true, message_id: data?.sid, raw: data };
}

async function sendViaMeta(input: WhatsAppSendInput, phoneNumberId: string): Promise<WhatsAppSendResult> {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "META_WHATSAPP_TOKEN fehlt" };
  if (!phoneNumberId) return { ok: false, error: "Meta Phone Number ID fehlt" };

  const to = normalizePhoneE164(input.to);

  let payload: Record<string, unknown>;
  if (input.template) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: input.template.template_name,
        language: { code: input.template.language_code },
        components: input.template.variables.length
          ? [
              {
                type: "body",
                parameters: input.template.variables.map((v) => ({ type: "text", text: v })),
              },
            ]
          : undefined,
      },
    };
  } else if (input.body) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: input.body },
    };
  } else {
    return { ok: false, error: "Weder Text noch Template angegeben" };
  }

  const res = await fetch(`${META_GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error?.message || `Meta ${res.status}`,
      raw: data,
    };
  }
  return { ok: true, message_id: data?.messages?.[0]?.id, raw: data };
}

export async function sendWhatsApp(
  provider: WhatsAppProvider,
  input: WhatsAppSendInput,
  cfg: { twilioFrom?: string | null; metaPhoneNumberId?: string | null },
): Promise<WhatsAppSendResult> {
  if (provider === "twilio") return sendViaTwilio(input, cfg.twilioFrom ?? "");
  if (provider === "meta") return sendViaMeta(input, cfg.metaPhoneNumberId ?? "");
  return { ok: false, error: `Unbekannter Provider: ${provider}` };
}
