// Telegram gateway helper – läuft nur serverseitig.
import { createHash } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function authHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const tg = process.env.TELEGRAM_API_KEY;
  if (!lov) throw new Error("LOVABLE_API_KEY ist nicht gesetzt");
  if (!tg) throw new Error("TELEGRAM_API_KEY ist nicht gesetzt");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": tg,
    "Content-Type": "application/json",
  };
}

export function telegramWebhookSecret(): string {
  const tg = process.env.TELEGRAM_API_KEY;
  if (!tg) throw new Error("TELEGRAM_API_KEY ist nicht gesetzt");
  return createHash("sha256").update(`telegram-webhook:${tg}`).digest("base64url");
}

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const err: any = new Error(`Telegram ${method} fehlgeschlagen [${res.status}]: ${JSON.stringify(data)}`);
    err.status = res.status;
    err.providerBody = data;
    throw err;
  }
  return data;
}

export async function tgSendMessage(
  chat_id: number,
  text: string,
  opts: { reply_markup?: unknown; parse_mode?: "HTML" | "Markdown" } = {},
) {
  return call("sendMessage", { chat_id, text, ...opts });
}

export async function tgGetMe(): Promise<{ id: number; username?: string; first_name?: string }> {
  const r = await call("getMe", {});
  return r.result;
}

export async function tgSetWebhook(url: string) {
  return call("setWebhook", {
    url,
    secret_token: telegramWebhookSecret(),
    allowed_updates: ["message", "edited_message", "callback_query"],
  });
}

export async function tgAnswerCallback(callback_query_id: string, text?: string) {
  return call("answerCallbackQuery", { callback_query_id, text, show_alert: false });
}
