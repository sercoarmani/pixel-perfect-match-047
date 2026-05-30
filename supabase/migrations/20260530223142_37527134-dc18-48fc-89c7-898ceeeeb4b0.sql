-- Verwaiste Verweise entfernen, damit der FK angelegt werden kann
DELETE FROM public.mitarbeiter_dokumente d
WHERE d.mitarbeiter_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.mitarbeiter m WHERE m.id = d.mitarbeiter_id);

ALTER TABLE public.mitarbeiter_dokumente
  ADD CONSTRAINT mitarbeiter_dokumente_mitarbeiter_id_fkey
  FOREIGN KEY (mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mitarbeiter_dokumente_mitarbeiter_id
  ON public.mitarbeiter_dokumente(mitarbeiter_id);