CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-tts-audios-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-tts-audios-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/cleanup-tts-audios',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW9naWZnbXV0Zm1ieWh6enlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzQ2NTQsImV4cCI6MjA4MjYxMDY1NH0.kcwdkvOfU8gnjlcZT8eMPHw3C8YLDMs4DokLyfRveKA"}'::jsonb,
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $$
);