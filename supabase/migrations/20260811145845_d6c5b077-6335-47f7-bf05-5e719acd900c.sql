-- Mandato (recorrência) do PIX Automático no Banco Inter.
CREATE TABLE public.inter_pix_recurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_rec TEXT UNIQUE,
  id_solic_rec TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contract_id TEXT,
  plan TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  periodicidade TEXT NOT NULL,
  value_cents INTEGER NOT NULL,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  trial_value_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'CRIADA',
  start_date DATE,
  finish_date DATE,
  next_charge_date DATE,
  qr_payload TEXT,
  qr_encoded_image TEXT,
  qr_expires_at TIMESTAMPTZ,
  authorization_url TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_cpf TEXT,
  fbp TEXT,
  fbc TEXT,
  ga_client_id TEXT,
  replaced_by_id_rec TEXT,
  last_error TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inter_rec_email ON public.inter_pix_recurrences (customer_email);
CREATE INDEX idx_inter_rec_status ON public.inter_pix_recurrences (status);
CREATE INDEX idx_inter_rec_next_charge ON public.inter_pix_recurrences (next_charge_date) WHERE status = 'APROVADA';

GRANT ALL ON public.inter_pix_recurrences TO service_role;
GRANT SELECT ON public.inter_pix_recurrences TO authenticated;
ALTER TABLE public.inter_pix_recurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver recorrencias Inter"
  ON public.inter_pix_recurrences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_inter_pix_recurrences_updated_at
  BEFORE UPDATE ON public.inter_pix_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cobranças (cobr) geradas contra o mandato, uma por ciclo.
CREATE TABLE public.inter_pix_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  txid TEXT NOT NULL UNIQUE,
  id_rec TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cycle_index INTEGER,
  due_date DATE NOT NULL,
  value_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CRIADA',
  paid_at TIMESTAMPTZ,
  e2e_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inter_charges_id_rec ON public.inter_pix_charges (id_rec);
CREATE INDEX idx_inter_charges_status ON public.inter_pix_charges (status);
CREATE UNIQUE INDEX idx_inter_charges_cycle ON public.inter_pix_charges (id_rec, due_date);

GRANT ALL ON public.inter_pix_charges TO service_role;
GRANT SELECT ON public.inter_pix_charges TO authenticated;
ALTER TABLE public.inter_pix_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver cobrancas Inter"
  ON public.inter_pix_charges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_inter_pix_charges_updated_at
  BEFORE UPDATE ON public.inter_pix_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dedupe de webhooks do Inter (o Bacen reenvia notificação até receber 200).
CREATE TABLE public.inter_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.inter_webhook_events TO service_role;
ALTER TABLE public.inter_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver eventos Inter"
  ON public.inter_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));