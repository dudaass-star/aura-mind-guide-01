select cron.schedule(
  'reconcile-retention-offers-hourly',
  '17 * * * *',
  $$ select net.http_post(
       url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/reconcile-retention-offers',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')),
       body := '{"dry_run":false,"limit":100}'::jsonb
     ); $$
);