CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('response','session','journey','practice','report','reminder','engagement','commercial','billing','security')),
  notification_type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  selected_channel text CHECK (selected_channel IN ('push','whatsapp','in_app','none')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','opened','converted','suppressed')),
  path text,
  fallback_after timestamptz,
  expires_at timestamptz,
  conversion_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes veem as próprias entregas"
ON public.notification_deliveries FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE INDEX notification_deliveries_user_created_idx ON public.notification_deliveries (user_id, created_at DESC);
CREATE INDEX notification_deliveries_fallback_idx ON public.notification_deliveries (status, fallback_after) WHERE fallback_after IS NOT NULL;
CREATE TRIGGER notification_deliveries_updated_at
BEFORE UPDATE ON public.notification_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_push_device_updated_at();

ALTER TABLE public.push_notification_events DROP CONSTRAINT push_notification_events_event_type_check;
ALTER TABLE public.push_notification_events ADD CONSTRAINT push_notification_events_event_type_check CHECK (event_type IN ('invite_shown', 'activation_started', 'permission_granted', 'permission_denied', 'registered', 'disabled', 'sent', 'delivered', 'failed', 'opened', 'whatsapp_avoided', 'whatsapp_fallback'));
ALTER TABLE public.push_notification_events ADD COLUMN IF NOT EXISTS delivery_id uuid REFERENCES public.notification_deliveries(id) ON DELETE SET NULL;