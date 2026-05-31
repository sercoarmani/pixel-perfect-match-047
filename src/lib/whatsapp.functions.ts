import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsApp, type WhatsAppProvider } from "./whatsapp.server";
import { normalizePhoneE164 } from "./whatsapp-utils";

export type WhatsAppSettings = {
  provider: "none" | "twilio" | "meta";
  twilio_account_sid: string | null;
  twilio_from: string | null;
  meta_phone_number_id: string | null;
  meta_business_account_id: string | null;
  default_language: string;
  aktiv: boolean;
  updated_at: string;
  twilio_secret_present: boolean;
  meta_secret_present: boolean;
};

export type WhatsAppTemplate = {
  id: string;
  provider: "twilio" | "meta";
  name: string;
  template_name: string;
  language_code: string;
  body_preview: string;
  variables: { key: string; label: string }[];
  aktiv: boolean;
};

export const getWhatsAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsAppSettings> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data ?? {
      provider: "none",
      twilio_account_sid: null,
      twilio_from: null,
      meta_phone_number_id: null,
      meta_business_account_id: null,
      default_language: "de",
      aktiv: false,
      updated_at: new Date().toISOString(),
    };
    return {
      provider: row.provider as WhatsAppSettings["provider"],
      twilio_account_sid: row.twilio_account_sid,
      twilio_from: row.twilio_from,
      meta_phone_number_id: row.meta_phone_number_id,
      meta_business_account_id: row.meta_business_account_id,
      default_language: row.default_language,
      aktiv: row.aktiv,
      updated_at: row.updated_at,
      twilio_secret_present: Boolean(process.env.TWILIO_API_KEY),
      meta_secret_present: Boolean(process.env.META_WHATSAPP_TOKEN),
    };
  });

const SettingsSchema = z.object({
  provider: z.enum(["none", "twilio", "meta"]),
  twilio_account_sid: z.string().max(64).nullable().optional(),
  twilio_from: z.string().max(32).nullable().optional(),
  meta_phone_number_id: z.string().max(64).nullable().optional(),
  meta_business_account_id: z.string().max(64).nullable().optional(),
  default_language: z.string().min(2).max(10).default("de"),
  aktiv: z.boolean(),
});

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("whatsapp_settings")
      .upsert({ id: 1, ...data, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWhatsAppTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsAppTemplate[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      template_name: r.template_name,
      language_code: r.language_code,
      body_preview: r.body_preview ?? "",
      variables: Array.isArray(r.variables) ? r.variables : [],
      aktiv: r.aktiv,
    }));
  });

const TemplateSchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(["twilio", "meta"]),
  name: z.string().min(1).max(120),
  template_name: z.string().min(1).max(200),
  language_code: z.string().min(2).max(10),
  body_preview: z.string().max(2000).default(""),
  variables: z
    .array(z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(80) }))
    .max(20)
    .default([]),
  aktiv: z.boolean().default(true),
});

export const saveWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = { ...data, variables: data.variables ?? [] };
    if (data.id) {
      const { error } = await supabase.from("whatsapp_templates").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("whatsapp_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("whatsapp_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------- Versand -------

const BroadcastRecipient = z.object({
  mitarbeiter_id: z.string().uuid().nullable().optional(),
  name: z.string().max(200),
  telefon: z.string().min(4).max(40),
  body: z.string().max(4000).optional(),
  variables: z.array(z.string().max(500)).max(20).optional(),
});

const BroadcastSchema = z.object({
  recipients: z.array(BroadcastRecipient).min(1).max(500),
  template_id: z.string().uuid().nullable().optional(),
  freitext: z.string().max(4000).optional(),
});

export const sendWhatsAppBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BroadcastSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings, error: sErr } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settings || !settings.aktiv || settings.provider === "none") {
      throw new Error("WhatsApp-API ist nicht aktiv – bitte in der Verwaltung aktivieren.");
    }
    const provider = settings.provider as WhatsAppProvider;

    let template: any = null;
    if (data.template_id) {
      const { data: tpl, error: tErr } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", data.template_id)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!tpl) throw new Error("Template nicht gefunden");
      if (tpl.provider !== provider) {
        throw new Error(`Template ist für ${tpl.provider}, aktiver Provider ist ${provider}.`);
      }
      template = tpl;
    }

    const results: { name: string; telefon: string; ok: boolean; error?: string; message_id?: string }[] = [];

    for (const r of data.recipients) {
      const phone = normalizePhoneE164(r.telefon);
      if (!phone) {
        results.push({ name: r.name, telefon: r.telefon, ok: false, error: "ungültige Nummer" });
        continue;
      }
      const sendInput = template
        ? {
            to: phone,
            template: {
              template_name: template.template_name,
              language_code: template.language_code,
              variables: r.variables ?? [],
            },
          }
        : { to: phone, body: r.body ?? data.freitext ?? "" };

      const res = await sendWhatsApp(provider, sendInput, {
        twilioFrom: settings.twilio_from,
        metaPhoneNumberId: settings.meta_phone_number_id,
      });

      results.push({
        name: r.name,
        telefon: phone,
        ok: res.ok,
        error: res.error,
        message_id: res.message_id,
      });

      // Log
      await supabaseAdmin.from("versand_log").insert({
        kanal: "whatsapp",
        richtung: "out",
        status: res.ok ? "sent" : "failed",
        empfaenger: phone,
        absender: provider === "twilio" ? settings.twilio_from : settings.meta_phone_number_id,
        betreff: template ? `Template: ${template.name}` : "Freitext",
        inhalt: template ? `${template.template_name} (${(r.variables ?? []).join(" | ")})` : r.body ?? data.freitext ?? "",
        fehler: res.error ?? null,
        mitarbeiter_id: r.mitarbeiter_id ?? null,
        ausgeloest_von: userId,
        metadata: { provider, message_id: res.message_id ?? null },
      });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return { sent, failed, results };
  });
