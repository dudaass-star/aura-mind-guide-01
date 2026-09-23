ALTER TABLE public.portal_value_events
  DROP CONSTRAINT IF EXISTS portal_value_events_feature_check;

ALTER TABLE public.portal_value_events
  ADD CONSTRAINT portal_value_events_feature_check
  CHECK (feature IN ('conversation', 'session', 'journey', 'practice', 'progress', 'profile', 'today'));

ALTER TABLE public.portal_value_events
  DROP CONSTRAINT IF EXISTS portal_value_events_event_type_check;

ALTER TABLE public.portal_value_events
  ADD CONSTRAINT portal_value_events_event_type_check
  CHECK (char_length(event_type) BETWEEN 1 AND 80);

DROP INDEX IF EXISTS public.portal_value_events_once_idx;

CREATE UNIQUE INDEX portal_value_events_discovery_once_idx
ON public.portal_value_events (user_id, feature, event_type)
WHERE event_type IN ('presented', 'opened', 'experienced');

CREATE INDEX portal_value_events_today_created_idx
ON public.portal_value_events (user_id, created_at DESC)
WHERE feature = 'today';