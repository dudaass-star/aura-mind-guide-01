CREATE OR REPLACE FUNCTION public.manage_portal_journey_internal(
  _user_id uuid,
  _action text,
  _journey_id text DEFAULT NULL,
  _episode_id uuid DEFAULT NULL,
  _progress_percent integer DEFAULT NULL,
  _reflection_text text DEFAULT NULL,
  _goal text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_journey public.content_journeys%ROWTYPE;
  v_episode public.journey_episodes%ROWTYPE;
  v_progress public.journey_episode_progress%ROWTYPE;
  v_total integer;
BEGIN
  IF NOT public.has_portal_entitlement(_user_id) THEN RAISE EXCEPTION 'access_not_available'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  IF _action IN ('start', 'switch') THEN
    SELECT * INTO v_journey FROM public.content_journeys WHERE id = _journey_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'journey_not_available'; END IF;
    IF v_profile.current_journey_id IS NOT NULL AND v_profile.current_journey_id <> _journey_id THEN
      INSERT INTO public.user_journey_history (user_id, journey_id, status, confirmation_source, episode_reached)
      VALUES (_user_id, v_profile.current_journey_id, 'switched', 'customer_action', COALESCE(v_profile.current_episode, 0));
    END IF;
    UPDATE public.profiles SET current_journey_id = _journey_id, current_episode = 0,
      last_content_sent_at = NULL, journey_paused = false,
      journey_selected_goal = NULLIF(btrim(COALESCE(_goal, '')), '')
    WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'active', 'journey_id', _journey_id);
  END IF;

  IF _action = 'pause' THEN
    IF v_profile.current_journey_id IS NULL THEN RAISE EXCEPTION 'journey_not_available'; END IF;
    UPDATE public.profiles SET journey_paused = true WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'paused', 'journey_id', v_profile.current_journey_id, 'episode', v_profile.current_episode);
  END IF;

  IF _action = 'resume' THEN
    IF v_profile.current_journey_id IS NULL THEN RAISE EXCEPTION 'journey_not_available'; END IF;
    UPDATE public.profiles SET journey_paused = false WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'active', 'journey_id', v_profile.current_journey_id, 'episode', v_profile.current_episode);
  END IF;

  IF _action IN ('open', 'progress', 'reflect', 'discuss', 'complete') THEN
    SELECT * INTO v_progress FROM public.journey_episode_progress
      WHERE user_id = _user_id AND episode_id = _episode_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'episode_not_released'; END IF;
    SELECT * INTO v_episode FROM public.journey_episodes WHERE id = _episode_id;
    IF NOT FOUND OR v_episode.journey_id <> v_progress.journey_id THEN RAISE EXCEPTION 'episode_not_available'; END IF;

    IF _action = 'open' THEN
      UPDATE public.journey_episode_progress SET
        status = CASE WHEN status = 'released' THEN 'in_progress' ELSE status END,
        opened_at = COALESCE(opened_at, now()), last_read_at = now(),
        progress_percent = GREATEST(progress_percent, 1)
      WHERE id = v_progress.id;
    ELSIF _action = 'progress' THEN
      UPDATE public.journey_episode_progress SET
        status = CASE WHEN status = 'released' THEN 'in_progress' ELSE status END,
        opened_at = COALESCE(opened_at, now()), last_read_at = now(),
        progress_percent = GREATEST(progress_percent, LEAST(99, GREATEST(1, COALESCE(_progress_percent, 1))))
      WHERE id = v_progress.id;
    ELSIF _action = 'reflect' THEN
      IF char_length(btrim(COALESCE(_reflection_text, ''))) < 1 THEN RAISE EXCEPTION 'reflection_required'; END IF;
      IF char_length(_reflection_text) > 2000 THEN RAISE EXCEPTION 'reflection_too_long'; END IF;
      UPDATE public.journey_episode_progress SET reflection_text = btrim(_reflection_text), reflection_saved_at = now()
      WHERE id = v_progress.id;
    ELSIF _action = 'discuss' THEN
      UPDATE public.journey_episode_progress SET discussed_at = now() WHERE id = v_progress.id;
    ELSIF _action = 'complete' THEN
      UPDATE public.journey_episode_progress SET status = 'completed', progress_percent = 100,
        opened_at = COALESCE(opened_at, now()), last_read_at = now(), completed_at = COALESCE(completed_at, now())
      WHERE id = v_progress.id;
      SELECT total_episodes INTO v_total FROM public.content_journeys WHERE id = v_episode.journey_id;
      IF v_episode.episode_number >= v_total THEN
        IF v_profile.current_journey_id <> v_episode.journey_id THEN RAISE EXCEPTION 'journey_not_current'; END IF;
        INSERT INTO public.user_journey_history (user_id, journey_id, completed_at, status, confirmation_source, episode_reached)
        VALUES (_user_id, v_episode.journey_id, now(), 'completed', 'customer_confirmation', v_episode.episode_number);
        UPDATE public.profiles SET current_journey_id = NULL, current_episode = 0, journey_paused = false,
          journeys_completed = COALESCE(journeys_completed, 0) + 1, last_content_sent_at = now()
        WHERE user_id = _user_id;
        RETURN jsonb_build_object('status', 'journey_completed', 'journey_id', v_episode.journey_id);
      END IF;
    END IF;
    RETURN jsonb_build_object('status', _action, 'episode_id', _episode_id);
  END IF;

  RAISE EXCEPTION 'invalid_journey_action';
END;
$$;

REVOKE ALL ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_next_journey_episode(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_episode public.journey_episodes%ROWTYPE;
  v_pending uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.current_journey_id IS NULL OR v_profile.journey_paused THEN
    RETURN jsonb_build_object('released', false, 'reason', 'journey_unavailable');
  END IF;
  SELECT id INTO v_pending FROM public.journey_episode_progress
    WHERE user_id = _user_id AND journey_id = v_profile.current_journey_id AND status <> 'completed'
    ORDER BY episode_number DESC LIMIT 1;
  IF v_pending IS NOT NULL THEN RETURN jsonb_build_object('released', false, 'reason', 'pending_episode', 'episode_id', v_pending); END IF;
  SELECT * INTO v_episode FROM public.journey_episodes
    WHERE journey_id = v_profile.current_journey_id AND episode_number = COALESCE(v_profile.current_episode, 0) + 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('released', false, 'reason', 'no_next_episode'); END IF;
  INSERT INTO public.journey_episode_progress (user_id, journey_id, episode_id, episode_number, status)
  VALUES (_user_id, v_episode.journey_id, v_episode.id, v_episode.episode_number, 'released')
  ON CONFLICT (user_id, episode_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('released', false, 'reason', 'already_released', 'episode_id', v_episode.id); END IF;
  UPDATE public.profiles SET current_episode = v_episode.episode_number, last_content_sent_at = now() WHERE user_id = _user_id;
  RETURN jsonb_build_object('released', true, 'episode_id', v_episode.id, 'journey_id', v_episode.journey_id, 'episode_number', v_episode.episode_number);
END;
$$;

REVOKE ALL ON FUNCTION public.release_next_journey_episode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_next_journey_episode(uuid) TO service_role;