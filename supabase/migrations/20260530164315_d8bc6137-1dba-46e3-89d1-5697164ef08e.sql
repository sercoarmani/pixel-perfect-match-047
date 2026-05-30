
ALTER TABLE public.mitarbeiter
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS mitarbeiter_telegram_chat_id_key
  ON public.mitarbeiter (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_updates (
  update_id BIGINT PRIMARY KEY,
  chat_id BIGINT,
  mitarbeiter_id UUID,
  text TEXT,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_updates TO authenticated;
GRANT ALL ON public.telegram_updates TO service_role;

ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispo read telegram_updates"
ON public.telegram_updates FOR SELECT TO authenticated
USING (public.is_dispo(auth.uid()));
