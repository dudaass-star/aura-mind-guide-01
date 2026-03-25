
CREATE TABLE public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  email text,
  name text,
  plan text,
  billing text,
  payment_method text DEFAULT 'card',
  stripe_session_id text,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on checkout_sessions"
  ON public.checkout_sessions FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read checkout_sessions"
  ON public.checkout_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_checkout_sessions_created_at ON public.checkout_sessions (created_at);
CREATE INDEX idx_checkout_sessions_status ON public.checkout_sessions (status);
