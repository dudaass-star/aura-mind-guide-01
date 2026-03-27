CREATE TABLE public.dunning_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  customer_id text NOT NULL,
  invoice_id text,
  subscription_id text,
  phone_raw text,
  phone_resolved text,
  profile_found boolean NOT NULL DEFAULT false,
  profile_user_id uuid,
  link_generated boolean NOT NULL DEFAULT false,
  whatsapp_sent boolean NOT NULL DEFAULT false,
  error_stage text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dunning_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on dunning_attempts"
  ON public.dunning_attempts
  FOR ALL
  TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read dunning_attempts"
  ON public.dunning_attempts
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_dunning_attempts_event_id ON public.dunning_attempts(event_id);
CREATE INDEX idx_dunning_attempts_created_at ON public.dunning_attempts(created_at DESC);