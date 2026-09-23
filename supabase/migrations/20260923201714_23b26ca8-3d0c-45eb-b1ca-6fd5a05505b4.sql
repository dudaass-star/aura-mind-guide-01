CREATE OR REPLACE FUNCTION public.release_next_journey_episode(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_episode public.journey_episodes%ROWTYPE;
  v_pending public.journey_episode_progress%ROWTYPE;
  v_last_episode integer;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_profile.journey_paused OR v_profile.current_journey_id IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'inactive');
  END IF;

  SELECT * INTO v_pending FROM public.journey_episode_progress
  WHERE user_id = _user_id AND journey_id = v_profile.current_journey_id AND status IN ('released', 'in_progress')
  ORDER BY released_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('released', false, 'reason', 'pending_episode', 'episode_id', v_pending.episode_id);
  END IF;

  SELECT COALESCE(max(episode_number), 0) INTO v_last_episode
  FROM public.journey_episode_progress
  WHERE user_id = _user_id AND journey_id = v_profile.current_journey_id;

  SELECT * INTO v_episode FROM public.journey_episodes
  WHERE journey_id = v_profile.current_journey_id AND episode_number = v_last_episode + 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('released', false, 'reason', 'journey_finished'); END IF;

  INSERT INTO public.journey_episode_progress (user_id, journey_id, episode_id, episode_number, status, progress_percent, released_at)
  VALUES (_user_id, v_episode.journey_id, v_episode.id, v_episode.episode_number, 'released', 0, now())
  ON CONFLICT (user_id, episode_id) DO NOTHING;
  UPDATE public.profiles SET last_content_sent_at = now() WHERE user_id = _user_id;
  RETURN jsonb_build_object('released', true, 'episode_id', v_episode.id, 'episode_number', v_episode.episode_number);
END;
$function$;
REVOKE ALL ON FUNCTION public.release_next_journey_episode(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_next_journey_episode(uuid) TO service_role;