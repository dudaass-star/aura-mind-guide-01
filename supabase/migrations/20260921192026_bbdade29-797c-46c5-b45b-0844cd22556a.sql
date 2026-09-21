CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  token_hash text NOT NULL,
  platform text NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'ios', 'android', 'desktop')),
  user_agent text,
  permission text NOT NULL DEFAULT 'granted' CHECK (permission IN ('granted', 'denied', 'prompt')),
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO authenticated;
GRANT ALL ON public.push_devices TO service_role;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes veem os próprios aparelhos"
ON public.push_devices FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Clientes cadastram os próprios aparelhos"
ON public.push_devices FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Clientes atualizam os próprios aparelhos"
ON public.push_devices FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Clientes removem os próprios aparelhos"
ON public.push_devices FOR DELETE TO authenticated
USING (auth.uid() = user_id);
CREATE INDEX push_devices_user_enabled_idx ON public.push_devices (user_id, enabled) WHERE enabled = true;

CREATE TABLE public.push_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.push_devices(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('invite_shown', 'activation_started', 'permission_granted', 'permission_denied', 'registered', 'disabled', 'sent', 'delivered', 'failed', 'opened')),
  notification_type text,
  path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.push_notification_events TO authenticated;
GRANT ALL ON public.push_notification_events TO service_role;
ALTER TABLE public.push_notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes veem os próprios eventos de notificação"
ON public.push_notification_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Clientes registram os próprios eventos de notificação"
ON public.push_notification_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE INDEX push_notification_events_user_created_idx ON public.push_notification_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_push_device_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER push_devices_updated_at
BEFORE UPDATE ON public.push_devices
FOR EACH ROW EXECUTE FUNCTION public.set_push_device_updated_at();