ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS preparation_note text,
  ADD COLUMN IF NOT EXISTS reframe_feedback text,
  ADD COLUMN IF NOT EXISTS reframe_feedback_text text,
  ADD COLUMN IF NOT EXISTS reframe_feedback_at timestamptz;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_reframe_feedback_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_reframe_feedback_check
  CHECK (reframe_feedback IS NULL OR reframe_feedback IN ('confirmed', 'corrected'));

CREATE OR REPLACE FUNCTION public.record_portal_session_experience(
  _user_id uuid,
  _session_id uuid,
  _action text,
  _value text DEFAULT NULL,
  _rating integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session public.sessions%ROWTYPE;
  _clean_value text := nullif(btrim(coalesce(_value, '')), '');
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF _action NOT IN ('save_preparation', 'rate', 'confirm_reframe', 'correct_reframe') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _session
  FROM public.sessions
  WHERE id = _session_id AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_available' USING ERRCODE = 'P0002';
  END IF;

  IF _action = 'save_preparation' THEN
    IF _session.status <> 'scheduled' OR _session.scheduled_at <= now() THEN
      RAISE EXCEPTION 'session_not_available' USING ERRCODE = 'P0002';
    END IF;
    IF length(coalesce(_clean_value, '')) > 500 THEN
      RAISE EXCEPTION 'value_too_long' USING ERRCODE = '22023';
    END IF;
    UPDATE public.sessions SET preparation_note = _clean_value WHERE id = _session_id;
  ELSIF _action = 'rate' THEN
    IF _session.status <> 'completed' OR _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
      RAISE EXCEPTION 'invalid_rating' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.session_ratings (session_id, user_id, rating)
    VALUES (_session_id, _user_id, _rating)
    ON CONFLICT (session_id) DO UPDATE SET rating = EXCLUDED.rating;
  ELSIF _action = 'confirm_reframe' THEN
    IF _session.status <> 'completed' OR _session.reframe_text IS NULL THEN
      RAISE EXCEPTION 'reframe_not_available' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.sessions
    SET reframe_feedback = 'confirmed', reframe_feedback_text = NULL, reframe_feedback_at = now()
    WHERE id = _session_id;
  ELSE
    IF _session.status <> 'completed' OR _session.reframe_text IS NULL OR _clean_value IS NULL THEN
      RAISE EXCEPTION 'correction_required' USING ERRCODE = '22023';
    END IF;
    IF length(_clean_value) > 800 THEN
      RAISE EXCEPTION 'value_too_long' USING ERRCODE = '22023';
    END IF;
    UPDATE public.sessions
    SET reframe_feedback = 'corrected', reframe_feedback_text = _clean_value, reframe_feedback_at = now()
    WHERE id = _session_id;
    INSERT INTO public.user_memory_corrections (user_id, correction_text, source, confidence)
    VALUES (_user_id, _clean_value, 'session_reframe:' || _session_id::text, 10);
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', _action, 'session_id', _session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_portal_session_experience(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_portal_session_experience(uuid, uuid, text, text, integer) TO service_role;