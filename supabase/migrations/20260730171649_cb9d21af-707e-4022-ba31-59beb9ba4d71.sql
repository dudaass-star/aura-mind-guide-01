ALTER TABLE public.asaas_pix_authorizations
  ADD COLUMN IF NOT EXISTS recovery_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS autodebit_alert_sent_at timestamptz;