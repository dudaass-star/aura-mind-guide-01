select cron.schedule(
  'woovi-pix-audit',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/woovi-pix-audit',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')),
       body := '{}'::jsonb
     ); $$
);