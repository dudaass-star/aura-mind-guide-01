ALTER TABLE public.movement_recognitions
  ADD COLUMN consent_decision text NOT NULL DEFAULT 'pending' CHECK (consent_decision IN ('pending', 'accepted', 'declined')),
  ADD COLUMN consented_at timestamptz;

CREATE OR REPLACE FUNCTION public.movement_recognition_consent_internal(
  _recognition_id uuid,
  _user_id uuid,
  _decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recognition public.movement_recognitions;
BEGIN
  IF _user_id IS NULL OR _recognition_id IS NULL OR _decision NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  SELECT r.* INTO _recognition
  FROM public.movement_recognitions r
  JOIN public.movement_members m ON m.id = r.member_id
  WHERE r.id = _recognition_id
    AND m.user_id = _user_id
    AND m.status = 'active'
  FOR UPDATE OF r;

  IF _recognition.id IS NULL THEN
    RAISE EXCEPTION 'recognition_not_found';
  END IF;

  UPDATE public.movement_recognitions
  SET consent_decision = _decision,
      consented_at = now(),
      status = CASE WHEN _decision = 'accepted' THEN 'published' ELSE 'hidden' END,
      published_at = CASE WHEN _decision = 'accepted' THEN now() ELSE NULL END
  WHERE id = _recognition_id;

  RETURN jsonb_build_object('ok', true, 'decision', _decision);
END;
$$;

REVOKE ALL ON FUNCTION public.movement_recognition_consent_internal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movement_recognition_consent_internal(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.movement_public_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'members', (SELECT count(*) FROM public.movement_members WHERE status = 'active'),
    'started', (SELECT count(*) FROM public.movement_referrals WHERE is_valid AND started_at IS NOT NULL),
    'continued', (SELECT count(*) FROM public.movement_referrals WHERE is_valid AND continued_at IS NOT NULL),
    'mural', COALESCE((
      SELECT jsonb_agg(item ORDER BY published_at DESC)
      FROM (
        SELECT r.id, r.kind, r.title, r.body, r.published_at,
               public.movement_safe_name(m.public_name, m.display_mode) AS member_name
        FROM public.movement_recognitions r
        JOIN public.movement_members m ON m.id = r.member_id
        WHERE r.status = 'published'
          AND r.consent_decision = 'accepted'
          AND r.consented_at IS NOT NULL
          AND m.status = 'active'
          AND m.display_mode <> 'private'
          AND m.show_achievements
        ORDER BY r.published_at DESC
        LIMIT 12
      ) item
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.claim_movement_referral(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_movement_reach(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.movement_public_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_movement_started() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_movement_continued() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_movement_referral(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_movement_reach(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.movement_public_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_movement_started() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_movement_continued() TO service_role;