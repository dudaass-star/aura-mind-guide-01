ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS taster_offered_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_session_id uuid,
  ADD COLUMN IF NOT EXISTS taster_source text,
  ADD COLUMN IF NOT EXISTS taster_closed_at timestamptz;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_taster boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.taster_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL,
  phone_raw text,
  email text,
  name text,
  checkout_session_id uuid,
  plan text,
  billing_period text,
  source text NOT NULL DEFAULT 'porta_a',
  offered_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  charge_correlation_id text,
  charge_created_at timestamptz,
  paid_at timestamptz,
  value_cents integer NOT NULL DEFAULT 690,
  session_id uuid,
  session_completed_at timestamptz,
  converted_subscription_at timestamptz,
  expired_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS taster_offers_correlation_uniq
  ON public.taster_offers (charge_correlation_id)
  WHERE charge_correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS taster_offers_phone_idx ON public.taster_offers (phone_normalized, created_at DESC);

GRANT ALL ON public.taster_offers TO service_role;
GRANT SELECT ON public.taster_offers TO authenticated;
ALTER TABLE public.taster_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ler ofertas taster"
  ON public.taster_offers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER taster_offers_updated_at
  BEFORE UPDATE ON public.taster_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_config (key, value)
VALUES ('taster_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;