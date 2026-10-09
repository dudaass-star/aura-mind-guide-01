-- lovable-cron-fallback-reviewed: fila limitada, armada apenas durante pendências, com desarme após drenagem; indisponibilidade exige retomada em até um minuto
CREATE TABLE public.chat_response_recovery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, client_message_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now() + interval '2 minutes', lease_until timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes', last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, client_message_id)
);
GRANT SELECT ON public.chat_response_recovery TO authenticated;
GRANT ALL ON public.chat_response_recovery TO service_role;
ALTER TABLE public.chat_response_recovery ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_owner_read ON public.chat_response_recovery FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX chat_response_recovery_due ON public.chat_response_recovery(next_attempt_at) WHERE status IN ('pending','running');
CREATE OR REPLACE FUNCTION public.wake_chat_response_recovery() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, net, cron AS $$
DECLARE secret text;
BEGIN
 SELECT public.get_admin_metrics_snapshot_secret() INTO secret;
 IF secret IS NULL THEN RAISE EXCEPTION 'Segredo de recuperação indisponível'; END IF;
 PERFORM net.http_post(url := 'https://uhyogifgmutfmbyhzzyo.supabase.co/functions/v1/chat-response-recovery', headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',secret),body := '{}'::jsonb, timeout_milliseconds := 10000);
END; $$;
REVOKE ALL ON FUNCTION public.wake_chat_response_recovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wake_chat_response_recovery() TO service_role;
CREATE OR REPLACE FUNCTION public.arm_chat_response_recovery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(781492);
 IF EXISTS (SELECT 1 FROM public.chat_response_recovery WHERE status IN ('pending','running')) THEN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='chat-response-recovery-pending') THEN
   PERFORM cron.schedule('chat-response-recovery-pending','* * * * *','SELECT public.wake_chat_response_recovery()');
  END IF;
 ELSE
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='chat-response-recovery-pending') THEN PERFORM cron.unschedule('chat-response-recovery-pending'); END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.arm_chat_response_recovery() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER arm_chat_response_recovery AFTER INSERT OR UPDATE ON public.chat_response_recovery FOR EACH STATEMENT EXECUTE FUNCTION public.arm_chat_response_recovery();
CREATE OR REPLACE FUNCTION public.track_chat_response_recovery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.channel <> 'in_app' OR NEW.client_message_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.status = 'accepted' THEN
  INSERT INTO public.chat_response_recovery(user_id,client_message_id) VALUES(NEW.user_id,NEW.client_message_id::text) ON CONFLICT DO NOTHING;
 ELSIF NEW.status = 'failed' THEN
  UPDATE public.chat_response_recovery SET next_attempt_at=least(next_attempt_at,now()+interval '20 seconds'),last_error=left(NEW.error_code,200),updated_at=now() WHERE user_id=NEW.user_id AND client_message_id=NEW.client_message_id::text AND status='pending';
 ELSIF NEW.status IN ('completed','interrupted') THEN
  UPDATE public.chat_response_recovery SET status=CASE WHEN NEW.status='completed' THEN 'resolved' ELSE 'superseded' END,lease_until=NULL,updated_at=now() WHERE user_id=NEW.user_id AND client_message_id=NEW.client_message_id::text AND status IN ('pending','running');
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.track_chat_response_recovery() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER track_chat_response_recovery AFTER INSERT OR UPDATE OF status ON public.chat_turn_metrics FOR EACH ROW EXECUTE FUNCTION public.track_chat_response_recovery();
CREATE OR REPLACE FUNCTION public.claim_chat_response_recovery() RETURNS SETOF public.chat_response_recovery
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.chat_response_recovery SET status='exhausted',lease_until=NULL,updated_at=now() WHERE status IN ('pending','running') AND (expires_at <= now() OR (attempts>=3 AND (lease_until IS NULL OR lease_until<now())));
 RETURN QUERY WITH due AS (
  SELECT id FROM public.chat_response_recovery WHERE attempts<3 AND expires_at>now() AND ((status='pending' AND next_attempt_at<=now()) OR (status='running' AND lease_until<now())) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 3
 ) UPDATE public.chat_response_recovery q SET status='running',attempts=q.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now() FROM due WHERE q.id=due.id RETURNING q.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_chat_response_recovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_response_recovery() TO service_role;