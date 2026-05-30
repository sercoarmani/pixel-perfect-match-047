import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyAndAssignInbox } from "@/lib/email-inbox.server";

// Eingehende E-Mail (von Inbound-Provider / Lovable Emails / Forwarder)
const PayloadSchema = z.object({
  message_id: z.string().max(998).optional().nullable(),
  in_reply_to: z.string().max(998).optional().nullable(),
  from: z.object({
    email: z.string().email().max(320),
    name: z.string().max(255).optional().nullable(),
  }),
  to: z.string().email().max(320).optional().nullable(),
  subject: z.string().max(998).optional().nullable(),
  text: z.string().max(200_000).optional().nullable(),
  html: z.string().max(500_000).optional().nullable(),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(255),
        mime: z.string().max(255).optional().nullable(),
        size: z.number().int().nonnegative().optional().nullable(),
        url: z.string().url().max(2000).optional().nullable(),
      }),
    )
    .max(50)
    .optional(),
  received_at: z.string().datetime().optional().nullable(),
});

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(signature.replace(/^sha256=/, ""), "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/email/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.EMAIL_INBOUND_SECRET;
        if (!secret) {
          return new Response("Inbound secret not configured", { status: 500 });
        }

        const body = await request.text();
        const sig = request.headers.get("x-inbound-signature") ?? request.headers.get("x-signature");
        if (!verifySignature(body, sig, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed: z.infer<typeof PayloadSchema>;
        try {
          parsed = PayloadSchema.parse(JSON.parse(body));
        } catch (e: any) {
          return new Response(`Invalid payload: ${e?.message ?? "parse error"}`, { status: 400 });
        }

        // Duplikate via message_id verhindern
        if (parsed.message_id) {
          const { data: dup } = await supabaseAdmin
            .from("email_inbox")
            .select("id")
            .eq("message_id", parsed.message_id)
            .maybeSingle();
          if (dup) {
            return Response.json({ ok: true, duplicate: true, id: dup.id });
          }
        }

        const { data: inserted, error } = await supabaseAdmin
          .from("email_inbox")
          .insert({
            empfangen_am: parsed.received_at ?? new Date().toISOString(),
            von_email: parsed.from.email.toLowerCase(),
            von_name: parsed.from.name ?? null,
            an_email: parsed.to ?? null,
            betreff: parsed.subject ?? null,
            body_text: parsed.text ?? null,
            body_html: parsed.html ?? null,
            anhaenge: parsed.attachments ?? [],
            raw: parsed as never,
            message_id: parsed.message_id ?? null,
            in_reply_to: parsed.in_reply_to ?? null,
            status: "neu",
          })
          .select("id")
          .single();

        if (error || !inserted) {
          return new Response(`Insert failed: ${error?.message ?? "unknown"}`, { status: 500 });
        }

        // Klassifikation/Zuordnung asynchron (best effort)
        classifyAndAssignInbox(inserted.id).catch((e) =>
          console.error("[email-inbox] classify failed", inserted.id, e),
        );

        return Response.json({ ok: true, id: inserted.id });
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
