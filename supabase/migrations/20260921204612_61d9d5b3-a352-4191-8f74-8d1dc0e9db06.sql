ALTER TABLE public.push_notification_events
  DROP CONSTRAINT IF EXISTS push_notification_events_event_type_check;

ALTER TABLE public.push_notification_events
  ADD CONSTRAINT push_notification_events_event_type_check
  CHECK (event_type IN (
    'invite_shown', 'activation_started', 'permission_granted', 'permission_denied',
    'registered', 'disabled', 'sent', 'delivered', 'failed', 'opened', 'converted',
    'whatsapp_avoided', 'whatsapp_fallback', 'app_visible'
  ));