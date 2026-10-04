DO $$
BEGIN
  PERFORM cron.unschedule('meta-customer-audience-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'meta-customer-audience-daily',
  '30 7 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/sync-meta-customer-audience',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

SELECT net.http_post(
  url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/sync-meta-customer-audience',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
  ),
  body := '{}'::jsonb
) AS initial_request_id;