// Server-only: Freitext-E-Mail-Versand über die Lovable-Email-Queue.
// Rendert eine schlichte HTML-Hülle (kein React-Email) und reiht via pgmq ein.
// Loggt in versand_log (für das Versand-Protokoll) und email_send_log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logVersand } from "@/lib/versand-log.server";

const SENDER_DOMAIN = "notify.dispoplan.one";
const FROM_ADDRESS = "noreply@notify.dispoplan.one";
const FROM_NAME = "DispoPlan";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildHtml(bodyText: string): string {
  const para = bodyText
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html lang="de"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px"><tbody><tr><td>${para}<p style="font-size:11px;color:#94a3b8;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:12px">Diese Nachricht wurde über DispoPlan versendet.</p></td></tr></tbody></table></body></html>`;
}

export type FreemailRefs = {
  mitarbeiter_id?: string | null;
  einrichtung_id?: string | null;
  bedarf_id?: string | null;
  anfrage_id?: string | null;
  referenz_typ?: string | null;
  referenz_id?: string | null;
};

export type FreemailInput = {
  to: string;
  subject: string;
  body_text: string;
  reply_to?: string | null;
  refs?: FreemailRefs;
};

export type FreemailResult = {
  ok: boolean;
  fehler?: string;
  message_id: string;
};

export async function sendFreemail(
  input: FreemailInput,
  userId?: string | null,
): Promise<FreemailResult> {
  const messageId = crypto.randomUUID();
  const html = buildHtml(input.body_text);
  const refs = input.refs ?? {};

  // Suppression-Check (fail-closed)
  const recipient = input.to.toLowerCase().trim();
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails").select("id").eq("email", recipient).maybeSingle();
  if (suppressed) {
    await logVersand({
      kanal: "email", status: "failed",
      empfaenger: recipient, absender: FROM_ADDRESS,
      betreff: input.subject, inhalt: input.body_text.slice(0, 4000),
      ausgeloest_von: userId ?? null,
      fehler: "Empfänger ist auf der Sperrliste (unsubscribe/bounce)",
      mitarbeiter_id: refs.mitarbeiter_id ?? null,
      einrichtung_id: refs.einrichtung_id ?? null,
      bedarf_id: refs.bedarf_id ?? null,
      anfrage_id: refs.anfrage_id ?? null,
      referenz_typ: refs.referenz_typ ?? "freemail",
      referenz_id: refs.referenz_id ?? null,
      metadata: { message_id: messageId, suppressed: true },
    });
    return { ok: false, fehler: "Empfänger ist gesperrt", message_id: messageId };
  }

  let fehler: string | undefined;
  let ok = false;
  try {
    const payload: any = {
      to: input.to,
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      sender_domain: SENDER_DOMAIN,
      subject: input.subject,
      html,
      text: input.body_text,
      purpose: "transactional" as const,
      label: "freemail",
      idempotency_key: `freemail-${messageId}`,
      message_id: messageId,
      queued_at: new Date().toISOString(),
    };
    if (input.reply_to) payload.reply_to = input.reply_to;

    const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload,
    });
    if (enqErr) {
      fehler = enqErr.message;
    } else {
      ok = true;
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "freemail",
        recipient_email: input.to,
        status: "pending",
        metadata: { refs },
      });
    }
  } catch (e: any) {
    fehler = e?.message ?? String(e);
  }

  await logVersand({
    kanal: "email",
    status: ok ? "queued" : "failed",
    empfaenger: input.to,
    absender: FROM_ADDRESS,
    betreff: input.subject,
    inhalt: input.body_text.slice(0, 4000),
    ausgeloest_von: userId ?? null,
    fehler: fehler ?? null,
    mitarbeiter_id: refs.mitarbeiter_id ?? null,
    einrichtung_id: refs.einrichtung_id ?? null,
    bedarf_id: refs.bedarf_id ?? null,
    anfrage_id: refs.anfrage_id ?? null,
    referenz_typ: refs.referenz_typ ?? "freemail",
    referenz_id: refs.referenz_id ?? null,
    metadata: { message_id: messageId, reply_to: input.reply_to ?? null },
  });

  return { ok, fehler, message_id: messageId };
}
