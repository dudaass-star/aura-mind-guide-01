ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS wa_copiou_taster_sent_at timestamptz;