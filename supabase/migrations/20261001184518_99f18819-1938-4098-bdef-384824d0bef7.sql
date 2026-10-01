ALTER TABLE public.movement_members
  ADD COLUMN ambassador_since timestamptz;

UPDATE public.movement_members AS members
SET ambassador_since = members.created_at
WHERE EXISTS (
  SELECT 1
  FROM public.movement_referrals AS referrals
  WHERE referrals.member_id = members.id
);

CREATE OR REPLACE FUNCTION public.record_movement_reach(_referral_code text, _visitor_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _member public.movement_members; _ref public.movement_referrals;
BEGIN
  IF _visitor_key IS NULL OR char_length(_visitor_key) < 12 OR char_length(_visitor_key) > 100 THEN RETURN jsonb_build_object('recorded', false); END IF;
  SELECT * INTO _member FROM public.movement_members WHERE referral_code = lower(_referral_code) AND status = 'active' AND ambassador_since IS NOT NULL;
  IF _member.id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() = _member.user_id) THEN RETURN jsonb_build_object('recorded', false); END IF;
  INSERT INTO public.movement_referrals (member_id, visitor_hash) VALUES (_member.id, md5(_visitor_key)) ON CONFLICT (member_id, visitor_hash) DO UPDATE SET reached_at = LEAST(public.movement_referrals.reached_at, EXCLUDED.reached_at) RETURNING * INTO _ref;
  RETURN jsonb_build_object('recorded', true, 'shared_by', public.movement_safe_name(_member.public_name, _member.display_mode));
END $$;
REVOKE ALL ON FUNCTION public.record_movement_reach(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_movement_reach(text, text) TO anon, authenticated;