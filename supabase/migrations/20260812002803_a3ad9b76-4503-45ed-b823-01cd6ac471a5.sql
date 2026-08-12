CREATE TABLE public.woovi_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text UNIQUE,
  correlation_id text UNIQUE,
  subscription_id text UNIQUE,
  global_id text,
  recurrency_id text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan text NOT NULL,
  billing_period text NOT NULL,
  frequency text NOT NULL,
  value_cents integer NOT NULL,
  is_trial boolean NOT NULL DEFAULT false,
  trial_value_cents integer,
  status text NOT NULL DEFAULT 'CRIANDO',
  pix_status text,
  creation_status text NOT NULL DEFAULT 'creating',
  start_date date,
  next_charge_date date,
  qr_payload text,
  qr_encoded_image text,
  qr_expires_at timestamptz,
  authorization_url text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_cpf text,
  fbp text,
  fbc text,
  ga_client_id text,
  access_granted_at timestamptz,
  replaced_by_subscription_id text,
  last_error text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_woovi_subs_email ON public.woovi_subscriptions (customer_email);
CREATE INDEX idx_woovi_subs_user ON public.woovi_subscriptions (user_id);
CREATE INDEX idx_woovi_subs_status ON public.woovi_subscriptions (status);

CREATE TABLE public.woovi_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id text NOT NULL,
  installment_id text UNIQUE,
  cobr_id text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cycle_index integer NOT NULL DEFAULT 0,
  value_cents integer NOT NULL,
  due_date date,
  status text,
  paid_at timestamptz,
  access_activated_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_woovi_charges_sub ON public.woovi_charges (subscription_id);

CREATE TABLE public.woovi_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  kind text,
  payload jsonb,
  processing_status text NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 0,
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.woovi_subscriptions TO service_role;
GRANT ALL ON public.woovi_charges TO service_role;
GRANT ALL ON public.woovi_webhook_events TO service_role;
GRANT SELECT ON public.woovi_subscriptions TO authenticated;
GRANT SELECT ON public.woovi_charges TO authenticated;
GRANT SELECT ON public.woovi_webhook_events TO authenticated;

ALTER TABLE public.woovi_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.woovi_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.woovi_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver mandatos Woovi" ON public.woovi_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins podem ver cobrancas Woovi" ON public.woovi_charges
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins podem ver eventos Woovi" ON public.woovi_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_woovi_subscriptions_updated_at BEFORE UPDATE ON public.woovi_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_woovi_charges_updated_at BEFORE UPDATE ON public.woovi_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_woovi_webhook_events_updated_at BEFORE UPDATE ON public.woovi_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();