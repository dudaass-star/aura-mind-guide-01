ALTER TABLE public.asaas_pix_authorizations
  ADD COLUMN IF NOT EXISTS recovery_email_2_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;