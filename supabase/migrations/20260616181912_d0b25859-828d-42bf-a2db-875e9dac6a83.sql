
CREATE TABLE IF NOT EXISTS public.meta_capi_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  event_id text,
  source text,
  is_first_purchase boolean,
  email_present boolean,
  phone_present boolean,
  fbp_present boolean,
  fbc_present boolean,
  request_value numeric,
  meta_status int,
  meta_fbtrace_id text,
  meta_error text,
  raw_response jsonb
);

GRANT SELECT ON public.meta_capi_log TO authenticated;
GRANT ALL ON public.meta_capi_log TO service_role;

ALTER TABLE public.meta_capi_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read meta_capi_log"
  ON public.meta_capi_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_meta_capi_log_created_at ON public.meta_capi_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_capi_log_event ON public.meta_capi_log (event_name, created_at DESC);

ALTER TABLE public.asaas_pix_authorizations
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS ga_client_id text;

ALTER TABLE public.asaas_payments
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS ga_client_id text;
