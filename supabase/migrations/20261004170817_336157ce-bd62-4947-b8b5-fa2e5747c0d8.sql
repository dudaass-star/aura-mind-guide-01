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
  INSERT INTO public.scheduled_tasks (user_id, execute_at, task_type, payload, status)
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    now(),
    'meta_audience_sync',
    jsonb_build_object('run_key', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')),
    'pending'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.scheduled_tasks
    WHERE task_type = 'meta_audience_sync'
      AND payload->>'run_key' = to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
      AND status IN ('pending', 'executing', 'executed')
  );
  $cron$
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_tasks_meta_audience_daily_unique_idx
ON public.scheduled_tasks (task_type, (payload->>'run_key'))
WHERE task_type = 'meta_audience_sync';

INSERT INTO public.scheduled_tasks (user_id, execute_at, task_type, payload, status)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  now(),
  'meta_audience_sync',
  jsonb_build_object('run_key', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')),
  'pending'
)
ON CONFLICT DO NOTHING;