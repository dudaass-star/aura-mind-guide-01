REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_recent_tickets(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_ticket_history(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_support_kb(extensions.vector, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_kb_feedback(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_kb_gap(text, text, double precision, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_kb_usage(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_recovery_kb_usage(uuid[]) TO authenticated;