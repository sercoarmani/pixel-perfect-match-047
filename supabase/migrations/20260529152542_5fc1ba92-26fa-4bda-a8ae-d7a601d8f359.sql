
ALTER TABLE public.bedarfe
  ADD COLUMN IF NOT EXISTS ergebnis text NOT NULL DEFAULT 'offen',
  ADD COLUMN IF NOT EXISTS besetzt_durch uuid;

ALTER TABLE public.bedarfe
  ADD CONSTRAINT bedarfe_ergebnis_check CHECK (ergebnis IN ('offen','abgedeckt','abgesagt'));

ALTER TABLE public.bedarfe
  ADD CONSTRAINT bedarfe_besetzt_durch_fk
  FOREIGN KEY (besetzt_durch) REFERENCES public.mitarbeiter(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bedarfe_ergebnis_idx ON public.bedarfe(ergebnis);
CREATE INDEX IF NOT EXISTS bedarfe_besetzt_durch_idx ON public.bedarfe(besetzt_durch);

ALTER TABLE public.verfuegbarkeiten
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'frei';

ALTER TABLE public.verfuegbarkeiten
  ADD CONSTRAINT verfuegbarkeiten_status_check CHECK (status IN ('frei','vergeben'));

CREATE INDEX IF NOT EXISTS verfuegbarkeiten_lookup_idx
  ON public.verfuegbarkeiten(datum, dienst, status);

ALTER TABLE public.mitarbeiter
  ADD COLUMN IF NOT EXISTS umkreis_km numeric;
