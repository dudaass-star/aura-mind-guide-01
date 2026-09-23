REVOKE ALL ON FUNCTION public.sync_journey_profile_progress() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_journey_profile_progress() TO service_role;