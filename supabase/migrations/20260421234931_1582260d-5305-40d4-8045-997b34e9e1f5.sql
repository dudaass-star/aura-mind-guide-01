-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule IMAP poll every 2 minutes
SELECT cron.schedule(
  'support-imap-poll-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/support-imap-poll',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW9naWZnbXV0Zm1ieWh6enlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzQ2NTQsImV4cCI6MjA4MjYxMDY1NH0.kcwdkvOfU8gnjlcZT8eMPHw3C8YLDMs4DokLyfRveKA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Enable realtime on support_tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;