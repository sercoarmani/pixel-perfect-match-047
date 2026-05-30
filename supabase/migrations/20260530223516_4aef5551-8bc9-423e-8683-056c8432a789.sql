-- Verwaiste Zuordnungen leeren, damit die FKs angelegt werden können
UPDATE public.email_inbox e
   SET zugeordnet_einrichtung_id = NULL
 WHERE zugeordnet_einrichtung_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.einrichtungen x WHERE x.id = e.zugeordnet_einrichtung_id);

UPDATE public.email_inbox e
   SET zugeordnet_mitarbeiter_id = NULL
 WHERE zugeordnet_mitarbeiter_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.mitarbeiter m WHERE m.id = e.zugeordnet_mitarbeiter_id);

ALTER TABLE public.email_inbox
  ADD CONSTRAINT email_inbox_zugeordnet_einrichtung_id_fkey
  FOREIGN KEY (zugeordnet_einrichtung_id) REFERENCES public.einrichtungen(id) ON DELETE SET NULL;

ALTER TABLE public.email_inbox
  ADD CONSTRAINT email_inbox_zugeordnet_mitarbeiter_id_fkey
  FOREIGN KEY (zugeordnet_mitarbeiter_id) REFERENCES public.mitarbeiter(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_zugeordnet_einrichtung_id
  ON public.email_inbox(zugeordnet_einrichtung_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_zugeordnet_mitarbeiter_id
  ON public.email_inbox(zugeordnet_mitarbeiter_id);