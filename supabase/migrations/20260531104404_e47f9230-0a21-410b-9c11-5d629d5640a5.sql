-- WhatsApp provider settings (singleton)
CREATE TABLE public.whatsapp_settings (
  id integer PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'none', -- 'none' | 'twilio' | 'meta'
  twilio_account_sid text,
  twilio_from text, -- z.B. 'whatsapp:+4915123456789'
  meta_phone_number_id text,
  meta_business_account_id text,
  default_language text NOT NULL DEFAULT 'de',
  aktiv boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT whatsapp_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all whatsapp_settings"
  ON public.whatsapp_settings FOR ALL
  TO authenticated
  USING (public.is_dispo(auth.uid()))
  WITH CHECK (public.is_dispo(auth.uid()));

INSERT INTO public.whatsapp_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- WhatsApp templates (vorab genehmigte Templates für Massenversand)
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, -- 'twilio' | 'meta'
  name text NOT NULL, -- interne Bezeichnung
  template_name text NOT NULL, -- bei Meta: registrierter template name; bei Twilio: Content SID (HX...)
  language_code text NOT NULL DEFAULT 'de',
  body_preview text NOT NULL DEFAULT '', -- Vorschau mit {{1}}, {{2}}
  variables jsonb NOT NULL DEFAULT '[]'::jsonb, -- z.B. [{"key":"vorname","label":"Vorname"}]
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all whatsapp_templates"
  ON public.whatsapp_templates FOR ALL
  TO authenticated
  USING (public.is_dispo(auth.uid()))
  WITH CHECK (public.is_dispo(auth.uid()));

CREATE TRIGGER trg_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();