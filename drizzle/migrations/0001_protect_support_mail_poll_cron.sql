DO $$
DECLARE support_job bigint;
BEGIN
 SELECT jobid INTO support_job FROM cron.job WHERE jobname = 'support-imap-poll-every-2min';
 IF support_job IS NOT NULL THEN
 PERFORM cron.alter_job(support_job, command := $cmd$SELECT net.http_post(url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/support-imap-poll', headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', public.get_admin_metrics_snapshot_secret()), body := '{}'::jsonb);$cmd$);
 END IF;
END $$;