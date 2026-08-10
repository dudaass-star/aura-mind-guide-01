ALTER TABLE public.asaas_pix_authorizations
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_value_cents integer;

ALTER TABLE public.asaas_payments
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;