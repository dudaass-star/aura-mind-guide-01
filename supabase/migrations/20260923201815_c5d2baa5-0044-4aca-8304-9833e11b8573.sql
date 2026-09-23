UPDATE public.profiles AS profile
SET current_episode = counts.last_released
FROM (
  SELECT user_id, journey_id, COALESCE(max(episode_number), 0)::integer AS last_released
  FROM public.journey_episode_progress
  GROUP BY user_id, journey_id
) AS counts
WHERE profile.user_id = counts.user_id
  AND profile.current_journey_id = counts.journey_id;