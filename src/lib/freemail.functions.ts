import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendFreemail } from "@/lib/freemail.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FreemailSchema = z.object({
  to: z.string().email().max(320),
  subject: z.string().min(1).max(500),
  body_text: z.string().min(1).max(20000),
  reply_to: z.string().email().max(320).nullable().optional(),
  refs: z
    .object({
      mitarbeiter_id: z.string().uuid().nullable().optional(),
      einrichtung_id: z.string().uuid().nullable().optional(),
      bedarf_id: z.string().uuid().nullable().optional(),
      anfrage_id: z.string().uuid().nullable().optional(),
      referenz_typ: z.string().max(64).nullable().optional(),
      referenz_id: z.string().uuid().nullable().optional(),
    })
    .optional(),
  // Falls aus Posteingang-Antwort: Inbox-Eintrag auf "beantwortet" setzen.
  inbox_id: z.string().uuid().nullable().optional(),
});

export const sendeFreemail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FreemailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const result = await sendFreemail(
      {
        to: data.to,
        subject: data.subject,
        body_text: data.body_text,
        reply_to: data.reply_to ?? null,
        refs: data.refs,
      },
      context.userId,
    );
    if (result.ok && data.inbox_id) {
      await supabaseAdmin
        .from("email_inbox")
        .update({ status: "beantwortet", bearbeitet_am: new Date().toISOString(), bearbeitet_von: context.userId })
        .eq("id", data.inbox_id);
    }
    return result;
  });
