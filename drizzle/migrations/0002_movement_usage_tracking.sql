ALTER TABLE public.portal_value_events DROP CONSTRAINT portal_value_events_feature_check;
ALTER TABLE public.portal_value_events ADD CONSTRAINT portal_value_events_feature_check CHECK (feature IN ('conversation','session','journey','practice','progress','profile','today','app','movement'));
CREATE TABLE public.movement_usage_events (
 id uuid PRIMARY KEY, user_id uuid, visitor_hash text NOT NULL, session_hash text NOT NULL,
 event_type text NOT NULL, surface text NOT NULL CHECK(surface IN ('app','public','area')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.movement_usage_events TO authenticated;
GRANT ALL ON public.movement_usage_events TO service_role;
ALTER TABLE public.movement_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY movement_usage_admin_read ON public.movement_usage_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX movement_usage_created_idx ON public.movement_usage_events(created_at,event_type);
CREATE INDEX movement_usage_user_idx ON public.movement_usage_events(user_id,created_at);
CREATE FUNCTION public.record_movement_usage(_id uuid,_visitor_id uuid,_session_id uuid,_event_type text,_surface text,_metadata jsonb DEFAULT '{}'::jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _id IS NULL OR _visitor_id IS NULL OR _session_id IS NULL OR _surface NOT IN ('app','public','area') OR _event_type NOT IN ('home_viewed','card_viewed','card_clicked','public_viewed','area_opened','introduction_viewed','join_cta_clicked','role_selected','form_viewed','join_started','join_failed','member_joined','ambassador_joined','form_back','cause_selected','mural_viewed','kit_viewed','message_selected','invite_copied','whatsapp_share_started','share_started','share_completed','share_cancelled','share_failed','updates_enabled','updates_disabled') THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 IF _surface <> 'public' AND auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 IF jsonb_typeof(_metadata) <> 'object' OR octet_length(_metadata::text)>512 THEN RAISE EXCEPTION 'Metadados inválidos'; END IF;
 IF (SELECT count(*) FROM public.movement_usage_events WHERE visitor_hash=md5(_visitor_id::text) AND created_at>now()-interval '1 minute')>=120 THEN RETURN false; END IF;
 INSERT INTO public.movement_usage_events(id,user_id,visitor_hash,session_hash,event_type,surface,metadata)
 VALUES(_id,auth.uid(),md5(_visitor_id::text),md5(_session_id::text),_event_type,_surface,
 (SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(coalesce(_metadata,'{}'::jsonb)) WHERE key IN ('role','message_kind','reason','member','section')))
 ON CONFLICT(id) DO NOTHING;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.record_movement_usage(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_movement_usage(uuid,uuid,uuid,text,text,jsonb) TO anon,authenticated;
CREATE FUNCTION public.admin_movement_usage(_days integer DEFAULT 30,_include_tests boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; since_at timestamptz; tracking_at timestamptz := '2026-10-09T17:50:00Z';
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _days IS NULL OR _days<1 OR _days>90 THEN RAISE EXCEPTION 'Período inválido'; END IF;
 since_at := ((now() AT TIME ZONE 'America/Sao_Paulo')::date-(_days-1))::timestamp AT TIME ZONE 'America/Sao_Paulo';
 WITH eligible AS (
 SELECT e.* FROM public.movement_usage_events e WHERE e.created_at>=since_at AND (_include_tests OR (NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=e.user_id AND r.role='admin') AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=e.user_id AND p.status='demo')))
 ), real_members AS (
 SELECT m.* FROM public.movement_members m WHERE (_include_tests OR (NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=m.user_id AND r.role='admin') AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=m.user_id AND p.status='demo')))
 ), steps AS (
 SELECT event_type,count(*) AS events,count(DISTINCT user_id) AS users,count(DISTINCT visitor_hash) AS browsers,count(DISTINCT session_hash) AS visits FROM eligible GROUP BY event_type
 ), people AS (
 SELECT user_id,count(*) FILTER(WHERE event_type='area_opened') AS opens,bool_or(event_type='role_selected') AS chose,bool_or(event_type='form_viewed') AS form,bool_or(event_type='join_started') AS attempted,bool_or(event_type='member_joined') AS joined FROM eligible WHERE user_id IS NOT NULL GROUP BY user_id
 ), daily AS (
 SELECT d::date AS day,count(e.id) FILTER(WHERE event_type='area_opened') AS opens,count(DISTINCT e.user_id) FILTER(WHERE event_type='area_opened') AS users,count(e.id) FILTER(WHERE event_type='public_viewed') AS public_visits,count(DISTINCT e.user_id) FILTER(WHERE event_type='member_joined') AS joined FROM generate_series((since_at AT TIME ZONE 'America/Sao_Paulo')::date,(now() AT TIME ZONE 'America/Sao_Paulo')::date,'1 day') d LEFT JOIN eligible e ON (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date=d::date GROUP BY d
 )
 SELECT jsonb_build_object('trackingSince',tracking_at,'since',since_at,'updatedAt',now(),'includeTests',_include_tests,
 'steps',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM steps s),'[]'::jsonb),
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM daily d),'[]'::jsonb),
 'members',(SELECT jsonb_build_object('active',count(*) FILTER(WHERE status='active'),'ambassadors',count(*) FILTER(WHERE status='active' AND ambassador_since IS NOT NULL),'new',count(*) FILTER(WHERE created_at>=since_at),'updates',count(*) FILTER(WHERE status='active' AND receive_updates)) FROM real_members),
 'dropoff',(SELECT jsonb_build_object('openedWithoutChoice',count(*) FILTER(WHERE opens>0 AND NOT chose AND NOT joined),'formWithoutJoin',count(*) FILTER(WHERE form AND NOT joined),'attemptWithoutJoin',count(*) FILTER(WHERE attempted AND NOT joined),'returned',count(*) FILTER(WHERE opens>1)) FROM people),
 'referrals',(SELECT jsonb_build_object('reached',count(DISTINCT r.visitor_hash) FILTER(WHERE r.reached_at>=since_at),'started',count(DISTINCT r.referred_user_id) FILTER(WHERE r.started_at>=since_at),'continued',count(DISTINCT r.referred_user_id) FILTER(WHERE r.continued_at>=since_at)) FROM public.movement_referrals r JOIN real_members m ON m.id=r.member_id WHERE r.is_valid AND (_include_tests OR (NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=r.referred_user_id AND ur.role='admin') AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=r.referred_user_id AND p.status='demo'))))) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_movement_usage(integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_movement_usage(integer,boolean) TO authenticated;
COMMENT ON TABLE public.movement_usage_events IS 'Uso do Movimento a partir de 09/10/2026; chaves anônimas protegidas, sem texto de convite ou motivo pessoal. Cliques não comprovam envio.';