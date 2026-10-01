CREATE OR REPLACE FUNCTION public.claim_movement_referral_internal(_visitor_key text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ref public.movement_referrals;
  _profile public.profiles;
BEGIN
  IF _user_id IS NULL OR _visitor_key IS NULL OR char_length(_visitor_key) < 12 OR char_length(_visitor_key) > 100 THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.movement_referrals WHERE referred_user_id = _user_id) THEN
    RETURN true;
  END IF;

  SELECT r.* INTO _ref
  FROM public.movement_referrals r
  JOIN public.movement_members m ON m.id = r.member_id
  WHERE r.visitor_hash = md5(_visitor_key)
    AND r.referred_user_id IS NULL
    AND m.user_id <> _user_id
    AND r.reached_at > now() - interval '30 days'
  ORDER BY r.reached_at DESC
  LIMIT 1;

  IF _ref.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE user_id = _user_id;

  UPDATE public.movement_referrals
  SET referred_user_id = _user_id,
      started_at = CASE
        WHEN EXISTS (SELECT 1 FROM public.messages WHERE user_id = _user_id AND role = 'user') THEN COALESCE(started_at, now())
        ELSE started_at
      END,
      continued_at = CASE
        WHEN _profile.converted_at IS NOT NULL THEN COALESCE(continued_at, now())
        ELSE continued_at
      END
  WHERE id = _ref.id;

  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.claim_movement_referral_internal(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_movement_referral_internal(text, uuid) TO service_role;