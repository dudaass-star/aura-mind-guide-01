-- Backfill: assign default journey 'j1-ansiedade' to active/trial subscribers
-- who were onboarded before the journey-on-signup fix. These 38 profiles were
-- invisible to the periodic-content cron because current_journey_id was NULL.
-- Setting last_content_sent_at = NULL ensures they receive EP1 on the next tick
-- (the cron's eligibility filter accepts NULL as "ready").

UPDATE public.profiles
SET
  current_journey_id = 'j1-ansiedade',
  current_episode = 0,
  last_content_sent_at = NULL,
  updated_at = now()
WHERE status IN ('active', 'trial')
  AND phone IS NOT NULL
  AND current_journey_id IS NULL
  AND created_at < now() - interval '24 hours';