-- Block 1: Telegram-Kopplungsfelder

-- Hilfsfunktion: kurzen Kopplungscode generieren (Format: 3 Buchstaben aus Vorname + "-" + 4 Zeichen Random)
CREATE OR REPLACE FUNCTION public.generate_einmal_code(_vorname text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  prefix text;
  suffix text;
  candidate text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne I,O,0,1
  i int;
  tries int := 0;
BEGIN
  prefix := upper(regexp_replace(coalesce(_vorname, 'MA'), '[^A-Za-zÄÖÜäöüß]', '', 'g'));
  prefix := translate(prefix, 'ÄÖÜß', 'AOUS');
  IF length(prefix) < 2 THEN
    prefix := 'MA';
  END IF;
  prefix := substr(prefix, 1, 4);

  LOOP
    suffix := '';
    FOR i IN 1..4 LOOP
      suffix := suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    candidate := prefix || '-' || suffix;

    IF NOT EXISTS (SELECT 1 FROM public.mitarbeiter WHERE einmal_code = candidate) THEN
      RETURN candidate;
    END IF;

    tries := tries + 1;
    IF tries > 20 THEN
      RETURN candidate || '-' || substr(md5(random()::text), 1, 4);
    END IF;
  END LOOP;
END;
$$;

-- Spalten ergänzen
ALTER TABLE public.mitarbeiter
  ADD COLUMN IF NOT EXISTS einmal_code text,
  ADD COLUMN IF NOT EXISTS einmal_code_verbraucht_am timestamptz;

-- Bestehende Datensätze befüllen
UPDATE public.mitarbeiter
SET einmal_code = public.generate_einmal_code(vorname)
WHERE einmal_code IS NULL;

-- Unique-Index (Codes sind global eindeutig)
CREATE UNIQUE INDEX IF NOT EXISTS mitarbeiter_einmal_code_key
  ON public.mitarbeiter (einmal_code);

-- Trigger: bei Insert automatisch Code setzen, falls leer
CREATE OR REPLACE FUNCTION public.mitarbeiter_set_einmal_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.einmal_code IS NULL OR NEW.einmal_code = '' THEN
    NEW.einmal_code := public.generate_einmal_code(NEW.vorname);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mitarbeiter_set_einmal_code ON public.mitarbeiter;
CREATE TRIGGER trg_mitarbeiter_set_einmal_code
BEFORE INSERT ON public.mitarbeiter
FOR EACH ROW
EXECUTE FUNCTION public.mitarbeiter_set_einmal_code();