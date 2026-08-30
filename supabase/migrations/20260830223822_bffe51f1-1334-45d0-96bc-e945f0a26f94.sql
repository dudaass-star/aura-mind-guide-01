ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS pix_copied_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_copiou_20min_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_copiou_2h_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_pix_copied
  ON public.checkout_sessions (pix_copied_at)
  WHERE status = 'created' AND pix_copied_at IS NOT NULL;