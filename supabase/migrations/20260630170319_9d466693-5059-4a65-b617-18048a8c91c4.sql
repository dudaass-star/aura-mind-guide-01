ALTER TABLE public.dunning_attempts
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS template_sid text,
  ADD COLUMN IF NOT EXISTS message_sid text,
  ADD COLUMN IF NOT EXISTS attempt_number int,
  ADD COLUMN IF NOT EXISTS payment_id text;

CREATE INDEX IF NOT EXISTS idx_dunning_attempts_user_channel
  ON public.dunning_attempts (profile_user_id, channel);

CREATE INDEX IF NOT EXISTS idx_dunning_attempts_event_id
  ON public.dunning_attempts (event_id);