ALTER TABLE public.journey_reflection_feedback
DROP CONSTRAINT IF EXISTS journey_reflection_feedback_source_kind_check;

ALTER TABLE public.journey_reflection_feedback
ADD CONSTRAINT journey_reflection_feedback_source_kind_check
CHECK (source_kind IN ('thematic_snapshot', 'active_theme', 'weekly_report', 'monthly_report'));

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-report-sunday-10am-brt');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'weekly-report-monday-10am-brt',
  '0 13 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);