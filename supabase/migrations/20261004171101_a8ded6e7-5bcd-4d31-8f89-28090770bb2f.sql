INSERT INTO public.scheduled_tasks (user_id, execute_at, task_type, payload, status)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  now(),
  'meta_audience_sync',
  jsonb_build_object('run_key', 'manual-' || extract(epoch from now())::bigint::text),
  'pending'
);

SELECT net.http_post(
  url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/execute-scheduled-tasks',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb
) AS request_id;