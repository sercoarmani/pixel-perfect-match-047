ALTER TABLE public.einsaetze DROP CONSTRAINT IF EXISTS einsaetze_mitarbeiter_fk;
ALTER TABLE public.einsaetze DROP CONSTRAINT IF EXISTS einsaetze_einrichtung_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'einsaetze' AND c.contype = 'f'
      AND c.confrelid = 'public.mitarbeiter'::regclass
      AND c.confdeltype = 'c'
  ) THEN
    ALTER TABLE public.einsaetze
      ADD CONSTRAINT einsaetze_mitarbeiter_cascade_fk
      FOREIGN KEY (mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'einsaetze' AND c.contype = 'f'
      AND c.confrelid = 'public.einrichtungen'::regclass
      AND c.confdeltype = 'c'
  ) THEN
    ALTER TABLE public.einsaetze
      ADD CONSTRAINT einsaetze_einrichtung_cascade_fk
      FOREIGN KEY (einrichtung_id) REFERENCES public.einrichtungen(id) ON DELETE CASCADE;
  END IF;
END $$;