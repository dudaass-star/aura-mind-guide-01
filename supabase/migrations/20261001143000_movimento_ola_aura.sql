-- Movimento Olá Aura: adesão voluntária, atribuição honesta e reconhecimento sem ranking.
CREATE TABLE public.movement_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  public_name text NOT NULL CHECK (char_length(public_name) BETWEEN 2 AND 80),
  display_mode text NOT NULL DEFAULT 'first_name' CHECK (display_mode IN ('full_name', 'first_name', 'initials', 'private')),
  referral_code text NOT NULL UNIQUE DEFAULT lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'blocked')),
  commitment_accepted_at timestamptz NOT NULL DEFAULT now(),
  show_achievements boolean NOT NULL DEFAULT true,
  receive_updates boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.movement_members TO authenticated;
GRANT ALL ON public.movement_members TO service_role;
ALTER TABLE public.movement_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participante gerencia sua adesão ao Movimento" ON public.movement_members
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Administradores gerenciam participantes do Movimento" ON public.movement_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.movement_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.movement_members(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL,
  referred_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  reached_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  continued_at timestamptz,
  source text NOT NULL DEFAULT 'link',
  is_valid boolean NOT NULL DEFAULT true,
  invalid_reason text,
  UNIQUE (member_id, visitor_hash)
);
GRANT SELECT ON public.movement_referrals TO authenticated;
GRANT ALL ON public.movement_referrals TO service_role;
ALTER TABLE public.movement_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Embaixador acompanha seu próprio impacto" ON public.movement_referrals
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.movement_members m WHERE m.id = member_id AND m.user_id = auth.uid()));
CREATE POLICY "Administradores auditam impacto do Movimento" ON public.movement_referrals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.movement_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.movement_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('story', 'voice', 'achievement')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.movement_recognitions TO authenticated;
GRANT ALL ON public.movement_recognitions TO service_role;
ALTER TABLE public.movement_recognitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participante vê seus reconhecimentos" ON public.movement_recognitions
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.movement_members m WHERE m.id = member_id AND m.user_id = auth.uid()));
CREATE POLICY "Administradores moderam o mural" ON public.movement_recognitions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX movement_referrals_member_valid_idx ON public.movement_referrals (member_id, is_valid, reached_at DESC);
CREATE INDEX movement_referrals_referred_idx ON public.movement_referrals (referred_user_id) WHERE referred_user_id IS NOT NULL;
CREATE INDEX movement_recognitions_public_idx ON public.movement_recognitions (status, published_at DESC);

CREATE OR REPLACE FUNCTION public.movement_safe_name(_name text, _mode text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _mode
    WHEN 'full_name' THEN _name
    WHEN 'first_name' THEN split_part(_name, ' ', 1)
    WHEN 'initials' THEN (SELECT string_agg(left(part, 1) || '.', ' ') FROM unnest(regexp_split_to_array(_name, '\\s+')) part)
    ELSE 'Participante do Movimento'
  END
$$;

CREATE OR REPLACE FUNCTION public.record_movement_reach(_referral_code text, _visitor_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _member public.movement_members; _ref public.movement_referrals;
BEGIN
  IF _visitor_key IS NULL OR char_length(_visitor_key) < 12 OR char_length(_visitor_key) > 100 THEN RETURN jsonb_build_object('recorded', false); END IF;
  SELECT * INTO _member FROM public.movement_members WHERE referral_code = lower(_referral_code) AND status = 'active';
  IF _member.id IS NULL THEN RETURN jsonb_build_object('recorded', false); END IF;
  INSERT INTO public.movement_referrals (member_id, visitor_hash)
  VALUES (_member.id, md5(_visitor_key))
  ON CONFLICT (member_id, visitor_hash) DO UPDATE SET reached_at = LEAST(public.movement_referrals.reached_at, EXCLUDED.reached_at)
  RETURNING * INTO _ref;
  RETURN jsonb_build_object('recorded', true, 'shared_by', public.movement_safe_name(_member.public_name, _member.display_mode));
END $$;
GRANT EXECUTE ON FUNCTION public.record_movement_reach(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_movement_referral(_visitor_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ref public.movement_referrals; _profile public.profiles;
BEGIN
  IF auth.uid() IS NULL OR _visitor_key IS NULL THEN RETURN false; END IF;
  SELECT r.* INTO _ref FROM public.movement_referrals r
  JOIN public.movement_members m ON m.id = r.member_id
  WHERE r.visitor_hash = md5(_visitor_key) AND r.referred_user_id IS NULL AND m.user_id <> auth.uid() AND r.reached_at > now() - interval '30 days'
  ORDER BY r.reached_at DESC LIMIT 1;
  IF _ref.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  UPDATE public.movement_referrals SET
    referred_user_id = auth.uid(),
    started_at = CASE WHEN EXISTS (SELECT 1 FROM public.messages WHERE user_id = auth.uid() AND role = 'user') THEN now() ELSE started_at END,
    continued_at = CASE WHEN _profile.status IN ('active', 'trialing') OR _profile.converted_at IS NOT NULL THEN now() ELSE continued_at END
  WHERE id = _ref.id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_movement_referral(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.movement_public_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'members', (SELECT count(*) FROM public.movement_members WHERE status = 'active'),
    'started', (SELECT count(*) FROM public.movement_referrals WHERE is_valid AND started_at IS NOT NULL),
    'continued', (SELECT count(*) FROM public.movement_referrals WHERE is_valid AND continued_at IS NOT NULL),
    'mural', COALESCE((SELECT jsonb_agg(item ORDER BY published_at DESC) FROM (
      SELECT r.id, r.kind, r.title, r.body, r.published_at,
        public.movement_safe_name(m.public_name, m.display_mode) AS member_name
      FROM public.movement_recognitions r JOIN public.movement_members m ON m.id = r.member_id
      WHERE r.status = 'published' AND m.status = 'active' AND m.display_mode <> 'private' AND m.show_achievements
      ORDER BY r.published_at DESC LIMIT 12
    ) item), '[]'::jsonb)
  )
$$;
GRANT EXECUTE ON FUNCTION public.movement_public_snapshot() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_movement_started()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'user' THEN UPDATE public.movement_referrals SET started_at = COALESCE(started_at, NEW.created_at, now()) WHERE referred_user_id = NEW.user_id AND is_valid; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER movement_first_conversation AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.mark_movement_started();

CREATE OR REPLACE FUNCTION public.mark_movement_continued()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('active', 'trialing') OR NEW.converted_at IS NOT NULL THEN
    UPDATE public.movement_referrals SET continued_at = COALESCE(continued_at, now()) WHERE referred_user_id = NEW.user_id AND is_valid AND continued_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER movement_profile_continuity AFTER INSERT OR UPDATE OF status, converted_at ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.mark_movement_continued();
