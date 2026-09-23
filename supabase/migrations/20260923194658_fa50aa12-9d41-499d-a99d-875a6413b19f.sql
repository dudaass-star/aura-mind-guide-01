REVOKE EXECUTE ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_next_journey_episode(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_next_journey_episode(uuid) TO service_role;