CREATE TABLE public.webhook_payload_debug (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  from_phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);

CREATE INDEX idx_webhook_payload_debug_received_at ON public.webhook_payload_debug(received_at DESC);
CREATE INDEX idx_webhook_payload_debug_from_phone ON public.webhook_payload_debug(from_phone);

ALTER TABLE public.webhook_payload_debug ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_payload_debug"
ON public.webhook_payload_debug
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read webhook_payload_debug"
ON public.webhook_payload_debug
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));