GRANT SELECT ON public.monthly_reports TO authenticated;
GRANT ALL ON public.monthly_reports TO service_role;

CREATE POLICY "Clientes visualizam os próprios relatórios mensais"
ON public.monthly_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DO $$
BEGIN
  PERFORM cron.unschedule('monthly-report');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'monthly-report',
  '0 22 1 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);