
-- Status-Enum
DO $$ BEGIN
  CREATE TYPE public.email_inbox_status AS ENUM ('neu','zugeordnet','bedarf_angelegt','beantwortet','archiviert','fehler');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.email_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empfangen_am timestamptz NOT NULL DEFAULT now(),
  von_email text NOT NULL,
  von_name text,
  an_email text,
  betreff text,
  body_text text,
  body_html text,
  raw jsonb,
  anhaenge jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.email_inbox_status NOT NULL DEFAULT 'neu',
  tags text[] NOT NULL DEFAULT '{}',
  zugeordnet_einrichtung_id uuid,
  zugeordnet_mitarbeiter_id uuid,
  zuordnung_confidence numeric,
  zuordnung_quelle text,
  ai_kategorie text,
  ai_zusammenfassung text,
  ai_extrakt jsonb,
  notiz text,
  bearbeitet_von uuid,
  bearbeitet_am timestamptz,
  message_id text UNIQUE,
  in_reply_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_inbox TO authenticated;
GRANT ALL ON public.email_inbox TO service_role;

ALTER TABLE public.email_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all email_inbox"
  ON public.email_inbox FOR ALL
  TO authenticated
  USING (public.is_dispo(auth.uid()))
  WITH CHECK (public.is_dispo(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_inbox_status ON public.email_inbox(status, empfangen_am DESC);
CREATE INDEX IF NOT EXISTS idx_email_inbox_einrichtung ON public.email_inbox(zugeordnet_einrichtung_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_mitarbeiter ON public.email_inbox(zugeordnet_mitarbeiter_id);

CREATE TRIGGER email_inbox_touch_updated_at
  BEFORE UPDATE ON public.email_inbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
