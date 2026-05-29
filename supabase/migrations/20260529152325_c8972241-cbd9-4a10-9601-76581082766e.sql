
-- Add besetzt_durch to anfragen
ALTER TABLE public.anfragen
  ADD COLUMN IF NOT EXISTS besetzt_durch uuid;

-- Foreign keys
ALTER TABLE public.verfuegbarkeiten
  ADD CONSTRAINT verfuegbarkeiten_mitarbeiter_fk
  FOREIGN KEY (mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE CASCADE;

ALTER TABLE public.abwesenheiten
  ADD CONSTRAINT abwesenheiten_mitarbeiter_fk
  FOREIGN KEY (mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE CASCADE;

ALTER TABLE public.einsaetze
  ADD CONSTRAINT einsaetze_mitarbeiter_fk
  FOREIGN KEY (mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE RESTRICT;

ALTER TABLE public.einsaetze
  ADD CONSTRAINT einsaetze_einrichtung_fk
  FOREIGN KEY (einrichtung_id) REFERENCES public.einrichtungen(id) ON DELETE RESTRICT;

ALTER TABLE public.bedarfe
  ADD CONSTRAINT bedarfe_einrichtung_fk
  FOREIGN KEY (einrichtung_id) REFERENCES public.einrichtungen(id) ON DELETE CASCADE;

ALTER TABLE public.einrichtungen
  ADD CONSTRAINT einrichtungen_traeger_fk
  FOREIGN KEY (traeger_id) REFERENCES public.traeger(id) ON DELETE SET NULL;

ALTER TABLE public.anfragen
  ADD CONSTRAINT anfragen_besetzt_durch_fk
  FOREIGN KEY (besetzt_durch) REFERENCES public.mitarbeiter(id) ON DELETE SET NULL;

-- Indexes for joins / lookups
CREATE INDEX IF NOT EXISTS verfuegbarkeiten_mitarbeiter_idx ON public.verfuegbarkeiten(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS abwesenheiten_mitarbeiter_idx ON public.abwesenheiten(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS einsaetze_mitarbeiter_idx ON public.einsaetze(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS einsaetze_einrichtung_idx ON public.einsaetze(einrichtung_id);
CREATE INDEX IF NOT EXISTS bedarfe_einrichtung_idx ON public.bedarfe(einrichtung_id);
CREATE INDEX IF NOT EXISTS einrichtungen_traeger_idx ON public.einrichtungen(traeger_id);
CREATE INDEX IF NOT EXISTS anfragen_besetzt_durch_idx ON public.anfragen(besetzt_durch);
