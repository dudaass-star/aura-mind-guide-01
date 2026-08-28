select cron.unschedule('recovery-agent-flush-pending') where exists (select 1 from cron.job where jobname = 'recovery-agent-flush-pending');

select cron.schedule(
  'recovery-agent-flush-pending',
  '5 11 * * *',
  $$
  select net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/recovery-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeW9naWZnbXV0Zm1ieWh6enlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzQ2NTQsImV4cCI6MjA4MjYxMDY1NH0.kcwdkvOfU8gnjlcZT8eMPHw3C8YLDMs4DokLyfRveKA"}'::jsonb,
    body := '{"flush_pending": true}'::jsonb
  );
  $$
);