
-- Enum für Dokumenttyp
DO $$ BEGIN
  CREATE TYPE public.dokument_typ AS ENUM ('zertifikat','fuehrungszeugnis','profil','sonstiges');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabelle
CREATE TABLE public.mitarbeiter_dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id UUID NOT NULL,
  typ public.dokument_typ NOT NULL DEFAULT 'sonstiges',
  datei_path TEXT NOT NULL,
  dateiname TEXT NOT NULL,
  mime_type TEXT,
  groesse_bytes BIGINT,
  ausstellungsdatum DATE,
  ablaufdatum DATE,
  weitergabe_erlaubt BOOLEAN NOT NULL DEFAULT false,
  erkannt_json JSONB,
  erkannt_geprueft BOOLEAN NOT NULL DEFAULT false,
  erkannt_status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | fehler
  erkannt_fehler TEXT,
  notiz TEXT,
  hochgeladen_von UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mitarbeiter_dokumente_ma ON public.mitarbeiter_dokumente(mitarbeiter_id);
CREATE INDEX idx_mitarbeiter_dokumente_ablauf ON public.mitarbeiter_dokumente(ablaufdatum) WHERE ablaufdatum IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mitarbeiter_dokumente TO authenticated;
GRANT ALL ON public.mitarbeiter_dokumente TO service_role;

ALTER TABLE public.mitarbeiter_dokumente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo all mitarbeiter_dokumente"
ON public.mitarbeiter_dokumente
FOR ALL
TO authenticated
USING (public.is_dispo(auth.uid()))
WITH CHECK (public.is_dispo(auth.uid()));

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_mitarbeiter_dokumente_touch
BEFORE UPDATE ON public.mitarbeiter_dokumente
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Privater Storage-Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mitarbeiter-dokumente',
  'mitarbeiter-dokumente',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage-Policies: Dispo darf alles, nur in diesem Bucket
CREATE POLICY "dispo read mitarbeiter-dokumente"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'mitarbeiter-dokumente' AND public.is_dispo(auth.uid()));

CREATE POLICY "dispo insert mitarbeiter-dokumente"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mitarbeiter-dokumente' AND public.is_dispo(auth.uid()));

CREATE POLICY "dispo update mitarbeiter-dokumente"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'mitarbeiter-dokumente' AND public.is_dispo(auth.uid()))
WITH CHECK (bucket_id = 'mitarbeiter-dokumente' AND public.is_dispo(auth.uid()));

CREATE POLICY "dispo delete mitarbeiter-dokumente"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'mitarbeiter-dokumente' AND public.is_dispo(auth.uid()));
