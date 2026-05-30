-- Backfill max_radius_km from umkreis_km, default 30 km
UPDATE public.mitarbeiter
SET max_radius_km = COALESCE(max_radius_km, umkreis_km, 30)
WHERE max_radius_km IS NULL;

-- Default for future inserts
ALTER TABLE public.mitarbeiter
  ALTER COLUMN max_radius_km SET DEFAULT 30;

-- Trigger: keep max_radius_km populated automatically
CREATE OR REPLACE FUNCTION public.mitarbeiter_set_max_radius()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.max_radius_km IS NULL THEN
    NEW.max_radius_km := COALESCE(NEW.umkreis_km, 30);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mitarbeiter_set_max_radius ON public.mitarbeiter;
CREATE TRIGGER trg_mitarbeiter_set_max_radius
BEFORE INSERT OR UPDATE OF max_radius_km, umkreis_km ON public.mitarbeiter
FOR EACH ROW
EXECUTE FUNCTION public.mitarbeiter_set_max_radius();