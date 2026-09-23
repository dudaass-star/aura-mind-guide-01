CREATE OR REPLACE FUNCTION public.sync_journey_profile_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET current_episode = (
    SELECT COALESCE(max(episode_number), 0)::integer
    FROM public.journey_episode_progress
    WHERE user_id = NEW.user_id
      AND journey_id = NEW.journey_id
  )
  WHERE user_id = NEW.user_id
    AND current_journey_id = NEW.journey_id;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_journey_profile_progress() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_journey_profile_progress() TO service_role;