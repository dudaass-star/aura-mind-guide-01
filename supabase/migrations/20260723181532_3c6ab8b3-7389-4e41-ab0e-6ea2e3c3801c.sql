
-- Retention ladder foundation: schema for save offers, dunning tiers, and observability

-- 1) profiles: plan_tier for downgraded users (Lite/Base) sem quebrar plan atual
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_tier TEXT;
COMMENT ON COLUMN public.profiles.plan_tier IS 'Sub-tier de retenção: lite (R$19,90) ou base (R$9,90). NULL quando cliente está no plano regular indicado por profiles.plan.';

-- 2) cancellation_feedback: save offer outcome tracking
ALTER TABLE public.cancellation_feedback
  ADD COLUMN IF NOT EXISTS save_offer_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS save_tier TEXT,
  ADD COLUMN IF NOT EXISTS gateway TEXT;
COMMENT ON COLUMN public.cancellation_feedback.save_tier IS 'Tier da oferta: pause | discount_30 | lite | base';
COMMENT ON COLUMN public.cancellation_feedback.gateway IS 'stripe | asaas_card | asaas_pix';

-- 3) dunning_attempts: qual degrau da escada foi enviado e se converteu
ALTER TABLE public.dunning_attempts
  ADD COLUMN IF NOT EXISTS offer_tier TEXT,
  ADD COLUMN IF NOT EXISTS offer_accepted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS offer_token_code TEXT,
  ADD COLUMN IF NOT EXISTS days_past_due INTEGER;
COMMENT ON COLUMN public.dunning_attempts.offer_tier IS 'recover_card | discount_30 | lite | base';

-- 4) retention_tokens: deep-link único para aceitar oferta via WhatsApp/email
CREATE TABLE IF NOT EXISTS public.retention_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  tier TEXT NOT NULL,
  gateway TEXT NOT NULL,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_tokens_code ON public.retention_tokens(code);
CREATE INDEX IF NOT EXISTS idx_retention_tokens_user_id ON public.retention_tokens(user_id);

GRANT ALL ON public.retention_tokens TO service_role;
-- sem grant para anon/authenticated: sempre resolvido via edge function service_role

ALTER TABLE public.retention_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages retention_tokens"
  ON public.retention_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5) retention_events: telemetria unificada para Admin KPIs
CREATE TABLE IF NOT EXISTS public.retention_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  phone TEXT,
  origin TEXT NOT NULL,
  tier TEXT NOT NULL,
  action TEXT NOT NULL,
  gateway TEXT,
  channel TEXT,
  amount_cents INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retention_events_user_id ON public.retention_events(user_id);
CREATE INDEX IF NOT EXISTS idx_retention_events_created_at ON public.retention_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_events_tier ON public.retention_events(tier);
COMMENT ON COLUMN public.retention_events.origin IS 'cancel_flow | dunning | winback';
COMMENT ON COLUMN public.retention_events.action IS 'offered | accepted | declined | applied';

GRANT ALL ON public.retention_events TO service_role;

ALTER TABLE public.retention_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages retention_events"
  ON public.retention_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admins read retention_events"
  ON public.retention_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
