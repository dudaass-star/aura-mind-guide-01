REVOKE EXECUTE ON FUNCTION public.count_recent_tickets(text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_ticket_history(text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.match_support_kb(extensions.vector, double precision, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_feedback(uuid[], text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_kb_gap(text, text, double precision, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_kb_usage(uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_recovery_kb_usage(uuid[]) FROM authenticated;