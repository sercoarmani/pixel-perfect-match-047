
CREATE TYPE public.versand_kanal AS ENUM ('telegram','email','whatsapp','intern','sonstiges');
CREATE TYPE public.versand_richtung AS ENUM ('out','in');
CREATE TYPE public.versand_status AS ENUM ('queued','sent','delivered','failed','received');

CREATE TABLE public.versand_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kanal public.versand_kanal NOT NULL,
  richtung public.versand_richtung NOT NULL DEFAULT 'out',
  status public.versand_status NOT NULL DEFAULT 'sent',
  empfaenger text,
  absender text,
  betreff text,
  inhalt text,
  mitarbeiter_id uuid,
  einrichtung_id uuid,
  bedarf_id uuid,
  anfrage_id uuid,
  referenz_typ text,
  referenz_id uuid,
  ausgeloest_von uuid,
  fehler text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_versand_log_created_at ON public.versand_log (created_at DESC);
CREATE INDEX idx_versand_log_mitarbeiter ON public.versand_log (mitarbeiter_id);
CREATE INDEX idx_versand_log_einrichtung ON public.versand_log (einrichtung_id);
CREATE INDEX idx_versand_log_kanal_status ON public.versand_log (kanal, status);

GRANT SELECT, INSERT, UPDATE ON public.versand_log TO authenticated;
GRANT ALL ON public.versand_log TO service_role;

ALTER TABLE public.versand_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all versand_log"
ON public.versand_log
FOR ALL
TO authenticated
USING (public.is_dispo(auth.uid()))
WITH CHECK (public.is_dispo(auth.uid()));
