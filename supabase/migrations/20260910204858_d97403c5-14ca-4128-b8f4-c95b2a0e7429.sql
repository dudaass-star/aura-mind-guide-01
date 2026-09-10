ALTER TABLE public.dunning_attempts
  ADD COLUMN IF NOT EXISTS delivery_status text;

CREATE INDEX IF NOT EXISTS idx_dunning_attempts_delivery_status
  ON public.dunning_attempts (delivery_status, created_at DESC);