ALTER TABLE public.woovi_subscriptions
  ADD COLUMN IF NOT EXISTS entry_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS payer_bank text,
  ADD COLUMN IF NOT EXISTS entry_followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_followup_sent_at timestamptz;

ALTER TABLE public.woovi_charges
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS payer_bank text;