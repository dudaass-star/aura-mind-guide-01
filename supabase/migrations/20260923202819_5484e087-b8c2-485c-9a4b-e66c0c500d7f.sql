DROP POLICY IF EXISTS "Clientes registram o próprio progresso das jornadas" ON public.journey_episode_progress;
DROP POLICY IF EXISTS "Clientes atualizam o próprio progresso das jornadas" ON public.journey_episode_progress;
REVOKE INSERT, UPDATE, DELETE ON public.journey_episode_progress FROM authenticated;
GRANT SELECT ON public.journey_episode_progress TO authenticated;
GRANT ALL ON public.journey_episode_progress TO service_role;

ALTER TABLE public.user_journey_history DROP CONSTRAINT IF EXISTS user_journey_history_status_check;
ALTER TABLE public.user_journey_history ADD CONSTRAINT user_journey_history_status_check CHECK (status IN ('active', 'completed', 'switched', 'abandoned'));

UPDATE public.user_journey_history h
SET status = 'switched'
WHERE h.status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.user_journey_history newer
    WHERE newer.user_id = h.user_id AND newer.status = 'active'
      AND (newer.completed_at, newer.id) > (h.completed_at, h.id)
  );
CREATE UNIQUE INDEX IF NOT EXISTS user_journey_history_one_active_idx
ON public.user_journey_history (user_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.manage_portal_journey_internal(_user_id uuid, _action text, _journey_id text DEFAULT NULL, _episode_id uuid DEFAULT NULL, _progress_percent integer DEFAULT NULL, _reflection_text text DEFAULT NULL, _goal text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_episode public.journey_episodes%ROWTYPE;
  v_progress public.journey_episode_progress%ROWTYPE;
  v_total integer;
  v_current_episode integer;
BEGIN
  IF NOT public.has_portal_entitlement(_user_id) THEN RAISE EXCEPTION 'access_not_available'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  IF _action IN ('start', 'switch') THEN
    IF _journey_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.content_journeys WHERE id = _journey_id AND is_active = true) THEN RAISE EXCEPTION 'journey_not_found'; END IF;

    IF v_profile.current_journey_id = _journey_id THEN
      SELECT COALESCE(max(episode_number), 0) INTO v_current_episode FROM public.journey_episode_progress WHERE user_id = _user_id AND journey_id = _journey_id;
      UPDATE public.profiles SET journey_paused = false, current_episode = v_current_episode, journey_selected_goal = COALESCE(NULLIF(btrim(_goal), ''), journey_selected_goal) WHERE user_id = _user_id;
      RETURN jsonb_build_object('status', 'active', 'journey_id', _journey_id, 'episode', v_current_episode, 'unchanged', true);
    END IF;

    UPDATE public.user_journey_history SET status = 'switched', episode_reached = COALESCE(v_profile.current_episode, 0), completed_at = now()
    WHERE user_id = _user_id AND status = 'active';

    INSERT INTO public.user_journey_history (user_id, journey_id, completed_at, status, confirmation_source, episode_reached)
    VALUES (_user_id, _journey_id, now(), 'active', CASE WHEN _action = 'start' THEN 'guided_choice' ELSE 'customer_action' END, 0);

    SELECT COALESCE(max(episode_number), 0) INTO v_current_episode FROM public.journey_episode_progress WHERE user_id = _user_id AND journey_id = _journey_id;
    IF v_current_episode = 0 THEN
      SELECT * INTO v_episode FROM public.journey_episodes WHERE journey_id = _journey_id AND episode_number = 1;
      IF FOUND THEN
        INSERT INTO public.journey_episode_progress (user_id, journey_id, episode_id, episode_number, status, progress_percent, released_at)
        VALUES (_user_id, _journey_id, v_episode.id, 1, 'released', 0, now()) ON CONFLICT (user_id, episode_id) DO NOTHING;
        v_current_episode := 1;
      END IF;
    END IF;
    UPDATE public.profiles SET current_journey_id = _journey_id, current_episode = v_current_episode, journey_paused = false,
      journey_selected_goal = COALESCE(NULLIF(btrim(_goal), ''), journey_selected_goal), last_content_sent_at = now()
    WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'active', 'journey_id', _journey_id, 'episode', v_current_episode);
  ELSIF _action = 'pause' THEN
    IF v_profile.current_journey_id IS NULL THEN RAISE EXCEPTION 'journey_not_available'; END IF;
    UPDATE public.profiles SET journey_paused = true WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'paused');
  ELSIF _action = 'resume' THEN
    IF v_profile.current_journey_id IS NULL THEN RAISE EXCEPTION 'journey_not_available'; END IF;
    UPDATE public.profiles SET journey_paused = false WHERE user_id = _user_id;
    RETURN jsonb_build_object('status', 'active');
  END IF;

  IF _episode_id IS NULL THEN RAISE EXCEPTION 'episode_required'; END IF;
  SELECT * INTO v_episode FROM public.journey_episodes WHERE id = _episode_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'episode_not_found'; END IF;
  SELECT * INTO v_progress FROM public.journey_episode_progress WHERE user_id = _user_id AND episode_id = _episode_id FOR UPDATE;
  IF NOT FOUND OR v_progress.journey_id <> v_episode.journey_id THEN RAISE EXCEPTION 'episode_not_released'; END IF;

  IF _action = 'open' THEN
    IF v_progress.status <> 'completed' THEN UPDATE public.journey_episode_progress SET status = 'in_progress', opened_at = COALESCE(opened_at, now()), last_read_at = now(), progress_percent = GREATEST(progress_percent, 1), updated_at = now() WHERE id = v_progress.id; END IF;
    RETURN jsonb_build_object('status', CASE WHEN v_progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END);
  ELSIF _action = 'progress' THEN
    IF v_progress.status <> 'completed' THEN UPDATE public.journey_episode_progress SET status = 'in_progress', opened_at = COALESCE(opened_at, now()), last_read_at = now(), progress_percent = GREATEST(progress_percent, LEAST(99, GREATEST(1, COALESCE(_progress_percent, 1)))), updated_at = now() WHERE id = v_progress.id; END IF;
    RETURN jsonb_build_object('status', CASE WHEN v_progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END);
  ELSIF _action = 'reflect' THEN
    IF _reflection_text IS NULL OR char_length(btrim(_reflection_text)) < 1 OR char_length(_reflection_text) > 2000 THEN RAISE EXCEPTION 'invalid_reflection'; END IF;
    UPDATE public.journey_episode_progress SET reflection_text = btrim(_reflection_text), reflection_saved_at = now(), updated_at = now() WHERE id = v_progress.id;
    RETURN jsonb_build_object('status', 'reflected');
  ELSIF _action = 'discuss' THEN
    UPDATE public.journey_episode_progress SET discussed_at = COALESCE(discussed_at, now()), updated_at = now() WHERE id = v_progress.id;
    RETURN jsonb_build_object('status', 'discussed');
  ELSIF _action = 'complete' THEN
    IF v_progress.status = 'completed' THEN RETURN jsonb_build_object('status', 'completed', 'journey_id', v_episode.journey_id); END IF;
    UPDATE public.journey_episode_progress SET status = 'completed', progress_percent = 100, opened_at = COALESCE(opened_at, now()), last_read_at = now(), completed_at = COALESCE(completed_at, now()), updated_at = now() WHERE id = v_progress.id;
    SELECT total_episodes INTO v_total FROM public.content_journeys WHERE id = v_episode.journey_id;
    IF v_episode.episode_number >= v_total THEN
      UPDATE public.user_journey_history SET status = 'completed', completed_at = now(), episode_reached = v_episode.episode_number, confirmation_source = 'customer_confirmation' WHERE user_id = _user_id AND journey_id = v_episode.journey_id AND status = 'active';
      UPDATE public.profiles SET current_journey_id = NULL, current_episode = 0, journey_paused = false, journeys_completed = COALESCE(journeys_completed, 0) + 1 WHERE user_id = _user_id AND current_journey_id = v_episode.journey_id;
      RETURN jsonb_build_object('status', 'journey_completed', 'journey_id', v_episode.journey_id);
    END IF;
    RETURN jsonb_build_object('status', 'completed', 'journey_id', v_episode.journey_id);
  END IF;
  RAISE EXCEPTION 'invalid_action';
END;
$function$;
REVOKE ALL ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_portal_journey_internal(uuid,text,text,uuid,integer,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_next_journey_episode(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_episode public.journey_episodes%ROWTYPE;
  v_pending public.journey_episode_progress%ROWTYPE;
  v_last_episode integer;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_profile.journey_paused OR v_profile.current_journey_id IS NULL THEN RETURN jsonb_build_object('released', false, 'reason', 'inactive'); END IF;
  SELECT * INTO v_pending FROM public.journey_episode_progress WHERE user_id = _user_id AND journey_id = v_profile.current_journey_id AND status IN ('released', 'in_progress') ORDER BY released_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('released', false, 'reason', 'pending_episode', 'episode_id', v_pending.episode_id); END IF;
  SELECT COALESCE(max(episode_number), 0) INTO v_last_episode FROM public.journey_episode_progress WHERE user_id = _user_id AND journey_id = v_profile.current_journey_id;
  SELECT * INTO v_episode FROM public.journey_episodes WHERE journey_id = v_profile.current_journey_id AND episode_number = v_last_episode + 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('released', false, 'reason', 'journey_finished'); END IF;
  INSERT INTO public.journey_episode_progress (user_id, journey_id, episode_id, episode_number, status, progress_percent, released_at)
  VALUES (_user_id, v_episode.journey_id, v_episode.id, v_episode.episode_number, 'released', 0, now()) ON CONFLICT (user_id, episode_id) DO NOTHING;
  UPDATE public.profiles SET current_episode = GREATEST(COALESCE(current_episode, 0), v_episode.episode_number), last_content_sent_at = now() WHERE user_id = _user_id;
  RETURN jsonb_build_object('released', true, 'episode_id', v_episode.id, 'episode_number', v_episode.episode_number);
END;
$function$;
REVOKE ALL ON FUNCTION public.release_next_journey_episode(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_next_journey_episode(uuid) TO service_role;