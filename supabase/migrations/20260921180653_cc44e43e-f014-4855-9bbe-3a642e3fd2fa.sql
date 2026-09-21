REVOKE EXECUTE ON FUNCTION public.has_portal_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_portal_entitlement(uuid) TO service_role;