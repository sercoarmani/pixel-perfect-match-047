-- Block 1: Geomatching Datenfelder

-- Mitarbeiter: Heimatadresse + Radius + Koordinaten
ALTER TABLE public.mitarbeiter
  ADD COLUMN IF NOT EXISTS strasse text,
  ADD COLUMN IF NOT EXISTS ort text,
  ADD COLUMN IF NOT EXISTS max_radius_km numeric,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_fehler text,
  ADD COLUMN IF NOT EXISTS geocodiert_am timestamp with time zone;

COMMENT ON COLUMN public.mitarbeiter.max_radius_km IS
  'Fahrbereitschaft in km (Fahrstrecke). Filter rechnet mit Luftlinien-Reservefaktor.';
COMMENT ON COLUMN public.mitarbeiter.geocode_status IS
  'pending | ok | nicht_gefunden | fehler';

-- Einrichtungen: Einsatzort-Adresse + Koordinaten
ALTER TABLE public.einrichtungen
  ADD COLUMN IF NOT EXISTS strasse text,
  ADD COLUMN IF NOT EXISTS plz text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_fehler text,
  ADD COLUMN IF NOT EXISTS geocodiert_am timestamp with time zone;

COMMENT ON COLUMN public.einrichtungen.geocode_status IS
  'pending | ok | nicht_gefunden | fehler';

-- Indexe für schnelle Radius-Vorfilterung
CREATE INDEX IF NOT EXISTS idx_mitarbeiter_geo
  ON public.mitarbeiter (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_einrichtungen_geo
  ON public.einrichtungen (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Bei Adressänderung: Koordinaten zurücksetzen, damit neu geocodiert wird
CREATE OR REPLACE FUNCTION public.reset_geocode_on_address_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_TABLE_NAME = 'mitarbeiter') THEN
    IF NEW.strasse IS DISTINCT FROM OLD.strasse
       OR NEW.plz IS DISTINCT FROM OLD.plz
       OR NEW.ort IS DISTINCT FROM OLD.ort THEN
      NEW.lat := NULL;
      NEW.lng := NULL;
      NEW.geocode_status := 'pending';
      NEW.geocode_fehler := NULL;
      NEW.geocodiert_am := NULL;
    END IF;
  ELSIF (TG_TABLE_NAME = 'einrichtungen') THEN
    IF NEW.strasse IS DISTINCT FROM OLD.strasse
       OR NEW.plz IS DISTINCT FROM OLD.plz
       OR NEW.ort IS DISTINCT FROM OLD.ort THEN
      NEW.lat := NULL;
      NEW.lng := NULL;
      NEW.geocode_status := 'pending';
      NEW.geocode_fehler := NULL;
      NEW.geocodiert_am := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mitarbeiter_reset_geocode ON public.mitarbeiter;
CREATE TRIGGER trg_mitarbeiter_reset_geocode
  BEFORE UPDATE ON public.mitarbeiter
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_geocode_on_address_change();

DROP TRIGGER IF EXISTS trg_einrichtungen_reset_geocode ON public.einrichtungen;
CREATE TRIGGER trg_einrichtungen_reset_geocode
  BEFORE UPDATE ON public.einrichtungen
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_geocode_on_address_change();