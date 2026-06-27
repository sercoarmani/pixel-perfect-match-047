
CREATE TABLE IF NOT EXISTS public.telegram_notify_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE,
  label text,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_notify_recipients TO authenticated;
GRANT ALL ON public.telegram_notify_recipients TO service_role;

ALTER TABLE public.telegram_notify_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo manage telegram_notify_recipients"
  ON public.telegram_notify_recipients
  FOR ALL
  TO authenticated
  USING (public.is_dispo(auth.uid()))
  WITH CHECK (public.is_dispo(auth.uid()));

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_anfrage_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notify_url text := 'https://www.dispoplan.one/api/public/telegram/notify-anfrage';
  apikey text := 'sb_publishable__Y3mmIOkA2ttjtb0QI14Pg_nTbU6194';
BEGIN
  PERFORM net.http_post(
    url := notify_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', apikey
    ),
    body := jsonb_build_object('anfrage_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_anfrage_telegram ON public.anfragen;
CREATE TRIGGER trg_notify_anfrage_telegram
  AFTER INSERT ON public.anfragen
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_anfrage_telegram();
