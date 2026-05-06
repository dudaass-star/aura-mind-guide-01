
-- Adiciona controle de estágios da sequência de recuperação de checkout
ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS recovery_stage INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_stage1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_stage2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_stage3_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_recovery_progress
  ON public.checkout_sessions (status, recovery_stage, created_at)
  WHERE status = 'created';
