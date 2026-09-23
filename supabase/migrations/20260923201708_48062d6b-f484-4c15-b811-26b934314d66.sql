CREATE OR REPLACE FUNCTION public.sync_journey_profile_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET current_episode = (
    SELECT count(*)::integer
    FROM public.journey_episode_progress
    WHERE user_id = NEW.user_id
      AND journey_id = NEW.journey_id
      AND status = 'completed'
  )
  WHERE user_id = NEW.user_id
    AND current_journey_id = NEW.journey_id;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS sync_journey_profile_progress_trigger ON public.journey_episode_progress;
CREATE TRIGGER sync_journey_profile_progress_trigger
AFTER INSERT OR UPDATE OF status ON public.journey_episode_progress
FOR EACH ROW EXECUTE FUNCTION public.sync_journey_profile_progress();

UPDATE public.profiles AS profile
SET current_episode = counts.completed_count
FROM (
  SELECT user_id, journey_id, count(*) FILTER (WHERE status = 'completed')::integer AS completed_count
  FROM public.journey_episode_progress
  GROUP BY user_id, journey_id
) AS counts
WHERE profile.user_id = counts.user_id
  AND profile.current_journey_id = counts.journey_id;