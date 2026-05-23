
-- ===== 1. Drop public/portal-token policies on sensitive tables =====
DROP POLICY IF EXISTS "Anyone can read monthly reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Anyone can read short_links" ON public.short_links;
DROP POLICY IF EXISTS "Anyone can read portal tokens by token value" ON public.user_portal_tokens;

DROP POLICY IF EXISTS "Portal token holders can read profile" ON public.profiles;
DROP POLICY IF EXISTS "Portal token holders can read letters" ON public.monthly_letters;
DROP POLICY IF EXISTS "Portal token holders can read time_capsules" ON public.time_capsules;
DROP POLICY IF EXISTS "Portal token holders can read milestones" ON public.user_milestones;
DROP POLICY IF EXISTS "Portal token holders can read evolution summary" ON public.user_evolution_summary;
DROP POLICY IF EXISTS "Portal token holders can read weekly questions" ON public.weekly_questions;
DROP POLICY IF EXISTS "Portal token holders can read journey history" ON public.user_journey_history;

-- ===== 2. Make aura-tts-audios bucket private (signed URLs from now on) =====
UPDATE storage.buckets SET public = false WHERE id = 'aura-tts-audios';
DROP POLICY IF EXISTS "Public read access on aura-tts-audios" ON storage.objects;

-- Service role manages this bucket completely (signed URLs do not need a SELECT policy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Service role manages aura-tts-audios') THEN
    CREATE POLICY "Service role manages aura-tts-audios"
    ON storage.objects FOR ALL
    USING (bucket_id = 'aura-tts-audios' AND auth.role() = 'service_role')
    WITH CHECK (bucket_id = 'aura-tts-audios' AND auth.role() = 'service_role');
  END IF;
END $$;

-- ===== 3. Revoke EXECUTE on internal SECURITY DEFINER functions =====
-- (has_role is intentionally kept executable — it is used inside RLS policies)
REVOKE EXECUTE ON FUNCTION public.claim_pending_tasks(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_whatsapp_instance() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_feedback(uuid[], text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_gap(text, text, double precision, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_kb_usage(uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_support_kb(extensions.vector, double precision, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_recent_tickets(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_ticket_history(text, integer, integer) FROM anon, authenticated;

-- ===== 4. Realtime: restrict channel subscriptions to admins only =====
-- (Aura backend uses service_role which bypasses RLS; only AdminSupport subscribes from client)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Admins can subscribe to realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
