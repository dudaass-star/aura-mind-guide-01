ALTER TABLE public.asaas_payments
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text NULL;

CREATE INDEX IF NOT EXISTS idx_asaas_payments_subscription
  ON public.asaas_payments(asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;