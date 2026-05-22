
-- Tabela de pagamentos PIX via Asaas
CREATE TABLE public.asaas_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_cpf TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_method TEXT NOT NULL DEFAULT 'PIX',
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  pix_expires_at TIMESTAMPTZ,
  invoice_url TEXT,
  paid_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_asaas_payments_user_id ON public.asaas_payments(user_id);
CREATE INDEX idx_asaas_payments_status ON public.asaas_payments(status);
CREATE INDEX idx_asaas_payments_email ON public.asaas_payments(customer_email);
CREATE INDEX idx_asaas_payments_created_at ON public.asaas_payments(created_at DESC);

ALTER TABLE public.asaas_payments ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler/escrever via clientes (edge functions usam service role)
CREATE POLICY "Admins podem ler todos os pagamentos PIX"
  ON public.asaas_payments
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger de updated_at
CREATE TRIGGER update_asaas_payments_updated_at
  BEFORE UPDATE ON public.asaas_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna asaas_customer_id em profiles (para reuso do customer entre pagamentos)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_asaas_customer_id
  ON public.profiles(asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;
