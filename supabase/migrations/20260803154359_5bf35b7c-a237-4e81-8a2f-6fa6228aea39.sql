ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pix_consent_lost_at timestamptz;
COMMENT ON COLUMN public.profiles.pix_consent_lost_at IS 'Quando o consentimento PIX Automático Bacen foi cancelado pelo pagador no app do banco';

ALTER TABLE public.asaas_pix_authorizations ADD COLUMN IF NOT EXISTS replaced_by_authorization_id text;
ALTER TABLE public.asaas_pix_authorizations ADD COLUMN IF NOT EXISTS reauth_notified_at timestamptz;
ALTER TABLE public.asaas_pix_authorizations ADD COLUMN IF NOT EXISTS reauth_link_sent_at timestamptz;
COMMENT ON COLUMN public.asaas_pix_authorizations.replaced_by_authorization_id IS 'ID da nova autorização criada na reautorização, quando esta foi substituída';
COMMENT ON COLUMN public.asaas_pix_authorizations.reauth_notified_at IS 'Aviso informativo de consentimento perdido já enviado';
COMMENT ON COLUMN public.asaas_pix_authorizations.reauth_link_sent_at IS 'Link com QR de reautorização já enviado (D-2 do vencimento)';