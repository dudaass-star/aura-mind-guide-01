ALTER TABLE public.asaas_payments
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_15min_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_last_error text;

CREATE INDEX IF NOT EXISTS idx_asaas_payments_recovery_pending
  ON public.asaas_payments (created_at)
  WHERE status = 'PENDING' AND whatsapp_recovery_15min_sent_at IS NULL;