REVOKE EXECUTE ON FUNCTION public.record_movement_reach(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_movement_reach(text, text) TO service_role;