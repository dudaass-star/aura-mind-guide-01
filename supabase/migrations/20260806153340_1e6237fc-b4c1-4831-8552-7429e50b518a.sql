CREATE TABLE public.checkout_funnel_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anon_session_id text,
  step text NOT NULL,
  plan text,
  billing text,
  payment_method text,
  detail text,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.checkout_funnel_events TO anon;
GRANT INSERT, SELECT ON public.checkout_funnel_events TO authenticated;
GRANT ALL ON public.checkout_funnel_events TO service_role;

ALTER TABLE public.checkout_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_log_funnel_events"
ON public.checkout_funnel_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "admins_can_read_funnel_events"
ON public.checkout_funnel_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_checkout_funnel_events_created_at ON public.checkout_funnel_events (created_at DESC);
CREATE INDEX idx_checkout_funnel_events_step ON public.checkout_funnel_events (step, created_at DESC);