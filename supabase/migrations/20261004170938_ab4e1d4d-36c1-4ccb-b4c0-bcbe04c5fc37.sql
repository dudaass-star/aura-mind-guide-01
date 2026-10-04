SELECT net.http_post(
  url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/execute-scheduled-tasks',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb
) AS request_id;