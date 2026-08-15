select cron.schedule(
  'welcome-safety-net',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/welcome-safety-net',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);