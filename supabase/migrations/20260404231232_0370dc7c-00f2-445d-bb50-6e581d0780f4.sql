CREATE TABLE public.user_journey_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  journey_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_journey_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal token holders can read journey history"
  ON public.user_journey_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_portal_tokens WHERE user_portal_tokens.user_id = user_journey_history.user_id));

CREATE POLICY "Service role full access on user_journey_history"
  ON public.user_journey_history FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);