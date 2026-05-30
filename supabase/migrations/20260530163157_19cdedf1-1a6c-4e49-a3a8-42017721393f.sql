-- Mitarbeiter-Self-Service-Portal: persönlicher Token + Profilfelder
ALTER TABLE public.mitarbeiter
  ADD COLUMN IF NOT EXISTS zugangs_token text,
  ADD COLUMN IF NOT EXISTS plz text,
  ADD COLUMN IF NOT EXISTS fuehrerschein boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profil_text text;

-- Bestehende Mitarbeiter mit einem Token versorgen
UPDATE public.mitarbeiter
SET zugangs_token = replace(gen_random_uuid()::text, '-', '')
                  || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE zugangs_token IS NULL;

-- Neue Mitarbeiter erhalten Token automatisch
ALTER TABLE public.mitarbeiter
  ALTER COLUMN zugangs_token SET DEFAULT (
    replace(gen_random_uuid()::text, '-', '')
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  );

ALTER TABLE public.mitarbeiter
  ALTER COLUMN zugangs_token SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.mitarbeiter
    ADD CONSTRAINT mitarbeiter_zugangs_token_key UNIQUE (zugangs_token);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS mitarbeiter_zugangs_token_idx
  ON public.mitarbeiter (zugangs_token);