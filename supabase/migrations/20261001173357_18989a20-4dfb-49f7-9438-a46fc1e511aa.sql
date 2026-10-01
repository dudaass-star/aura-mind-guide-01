REVOKE EXECUTE ON FUNCTION public.record_movement_reach(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_movement_referral(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.movement_public_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_movement_reach(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_movement_referral(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.movement_public_snapshot() TO service_role;