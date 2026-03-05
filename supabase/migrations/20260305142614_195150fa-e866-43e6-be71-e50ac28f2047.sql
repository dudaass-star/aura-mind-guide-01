
-- Add health check columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz,
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz;

-- Create instance_health_logs table
CREATE TABLE public.instance_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  is_connected boolean NOT NULL DEFAULT false,
  smartphone_connected boolean NOT NULL DEFAULT false,
  error_message text,
  response_raw jsonb,
  alert_sent boolean NOT NULL DEFAULT false
);

-- RLS: service_role only
ALTER TABLE public.instance_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on instance_health_logs"
  ON public.instance_health_logs
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Index for fast queries by instance and time
CREATE INDEX idx_health_logs_instance_time ON public.instance_health_logs(instance_id, checked_at DESC);
