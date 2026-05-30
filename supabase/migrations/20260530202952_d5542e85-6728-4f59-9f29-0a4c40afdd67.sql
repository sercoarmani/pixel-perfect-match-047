
DO $$ BEGIN
  CREATE TYPE public.kundenbestaetigung_status AS ENUM ('entwurf','gesendet','fehler');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.kunden_bestaetigungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL,
  einrichtung_id uuid NOT NULL,
  bedarf_id uuid,
  einsatz_id uuid,
  status public.kundenbestaetigung_status NOT NULL DEFAULT 'entwurf',
  empfaenger_name text,
  empfaenger_email text,
  betreff text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  dokument_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ma_unterlagen_status text NOT NULL DEFAULT 'pending',
  ma_unterlagen_fehler text,
  gesendet_am timestamptz,
  fehler text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kunden_bestaetigungen TO authenticated;
GRANT ALL ON public.kunden_bestaetigungen TO service_role;

ALTER TABLE public.kunden_bestaetigungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all kunden_bestaetigungen"
ON public.kunden_bestaetigungen
FOR ALL TO authenticated
USING (public.is_dispo(auth.uid()))
WITH CHECK (public.is_dispo(auth.uid()));

CREATE TRIGGER kunden_bestaetigungen_touch
BEFORE UPDATE ON public.kunden_bestaetigungen
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_kunden_bestaetigungen_status ON public.kunden_bestaetigungen(status, created_at DESC);
CREATE INDEX idx_kunden_bestaetigungen_mitarbeiter ON public.kunden_bestaetigungen(mitarbeiter_id);
