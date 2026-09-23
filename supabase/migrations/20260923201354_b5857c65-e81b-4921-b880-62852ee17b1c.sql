UPDATE public.journey_episode_progress AS progress
SET status = 'completed',
    progress_percent = 100,
    completed_at = COALESCE(progress.completed_at, progress.released_at, now()),
    updated_at = now()
FROM public.profiles AS profile,
     public.journey_episodes AS episode
WHERE profile.user_id = progress.user_id
  AND episode.id = progress.episode_id
  AND profile.current_journey_id = episode.journey_id
  AND episode.episode_number < profile.current_episode
  AND progress.status = 'released'
  AND progress.reflection_text IS NULL;