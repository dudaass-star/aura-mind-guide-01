
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_winback_reactive_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_d3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_d14_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS winback_d30_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_canceled_winback
  ON public.profiles (status, canceled_at)
  WHERE status = 'canceled';
