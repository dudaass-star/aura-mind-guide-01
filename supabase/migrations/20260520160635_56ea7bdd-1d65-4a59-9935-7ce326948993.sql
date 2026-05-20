
SELECT cron.schedule(
  'recover-abandoned-checkout-whatsapp-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/recover-abandoned-checkout-whatsapp',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW9naWZnbXV0Zm1ieWh6enlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzQ2NTQsImV4cCI6MjA4MjYxMDY1NH0.kcwdkvOfU8gnjlcZT8eMPHw3C8YLDMs4DokLyfRveKA"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
