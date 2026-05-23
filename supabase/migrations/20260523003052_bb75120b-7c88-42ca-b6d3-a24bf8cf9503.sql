
-- Revoke from PUBLIC (default grant) — this is what the linter actually checks
REVOKE EXECUTE ON FUNCTION public.claim_pending_tasks(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_whatsapp_instance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_feedback(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_gap(text, text, double precision, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_kb_usage(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_support_kb(extensions.vector, double precision, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_recent_tickets(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_ticket_history(text, integer, integer) FROM PUBLIC, anon, authenticated;
