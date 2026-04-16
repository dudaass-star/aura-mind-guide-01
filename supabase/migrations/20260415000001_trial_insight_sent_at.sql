-- Add trial_insight_sent_at column for the "Efeito Espelho" feature
-- Tracks when the personalized mirror insight was sent to a trial user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_insight_sent_at timestamptz;
