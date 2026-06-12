-- Tabela de autorizações PIX Automático Bacen (Asaas).
-- Diferente de asaas_payments (cobranças individuais), aqui guardamos o consentimento
-- recorrente do pagador, que ativa o débito automático no banco dele.
CREATE TABLE public.asaas_pix_authorizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asaas_authorization_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  asaas_subscription_id TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contract_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  frequency TEXT NOT NULL,
  value_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  start_date DATE NOT NULL,
  finish_date DATE,
  qr_payload TEXT,
  qr_encoded_image TEXT,
  qr_expires_at TIMESTAMPTZ,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_cpf TEXT,
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_asaas_pix_auth_customer ON public.asaas_pix_authorizations(asaas_customer_id);
CREATE INDEX idx_asaas_pix_auth_subscription ON public.asaas_pix_authorizations(asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;
CREATE INDEX idx_asaas_pix_auth_status ON public.asaas_pix_authorizations(status);
CREATE INDEX idx_asaas_pix_auth_user_id ON public.asaas_pix_authorizations(user_id);
CREATE INDEX idx_asaas_pix_auth_created_at ON public.asaas_pix_authorizations(created_at DESC);

GRANT SELECT ON public.asaas_pix_authorizations TO authenticated;
GRANT ALL ON public.asaas_pix_authorizations TO service_role;

ALTER TABLE public.asaas_pix_authorizations ENABLE ROW LEVEL SECURITY;

-- Admins veem tudo; usuários comuns não precisam ler direto via cliente.
CREATE POLICY "Admins podem ler todas as autorizações PIX"
  ON public.asaas_pix_authorizations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_asaas_pix_authorizations_updated_at
  BEFORE UPDATE ON public.asaas_pix_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();