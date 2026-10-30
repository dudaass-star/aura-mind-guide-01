CREATE OR REPLACE FUNCTION public.apply_degustacao_session_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _status text;
  _plan text;
  _reason text;
  _interrupted integer;
BEGIN
  SELECT lower(coalesce(status, '')), lower(coalesce(plan, '')) INTO _status, _plan FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  -- Degustação gratuita e plano Orações compartilham a mesma regra: 1 encontro cortesia, depois exige plano com acompanhamento.
  IF _status = 'degustacao' THEN _reason := 'degustacao_gratuita';
  ELSIF _plan = 'oracoes' THEN _reason := 'oracoes_cortesia';
  ELSE RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO _interrupted FROM public.sessions s
      WHERE s.user_id = NEW.user_id AND s.quota_exempt_reason = _reason
        AND (s.status = 'no_show' OR (s.status = 'completed' AND s.closure_mode IN ('unilateral', 'no_show')));
    IF NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = NEW.user_id AND s.quota_exempt_reason = _reason
        AND s.status NOT IN ('cancelled', 'no_show')
        AND NOT (s.status = 'completed' AND coalesce(s.closure_mode, '') IN ('unilateral', 'no_show'))
    ) AND _interrupted < 3 THEN
      NEW.quota_exempt := true;
      NEW.quota_exempt_reason := _reason;
      RETURN NEW;
    END IF;
    IF NEW.status = 'in_progress' THEN
      RAISE EXCEPTION 'plan_required' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = NEW.user_id AND s.quota_exempt = false AND s.status = 'scheduled'
    ) THEN
      RAISE EXCEPTION 'degustacao_next_session_exists' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' AND NOT coalesce(NEW.quota_exempt, false) THEN
    RAISE EXCEPTION 'plan_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_portal_session_internal(_user_id uuid, _action text, _scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile public.profiles%ROWTYPE;
  _session public.sessions%ROWTYPE;
  _limit integer;
  _used integer;
  _month_start timestamptz;
  _next_month timestamptz;
  _now timestamptz := now();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000'; END IF;
  IF _action NOT IN ('schedule', 'reschedule', 'cancel', 'start', 'start_now') THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _profile FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_portal_entitlement(_user_id) THEN
    RAISE EXCEPTION 'access_not_available' USING ERRCODE = '42501';
  END IF;

  _limit := CASE
    WHEN lower(coalesce(_profile.status, '')) = 'degustacao' THEN 1
    WHEN lower(coalesce(_profile.plan, '')) = 'oracoes' THEN 1
    WHEN lower(coalesce(_profile.plan_tier, '')) = 'base' THEN 0
    WHEN lower(coalesce(_profile.plan_tier, '')) IN ('lite', 'taster') THEN 1
    WHEN lower(coalesce(_profile.plan, '')) = 'essencial' THEN 1
    WHEN lower(coalesce(_profile.plan, '')) = 'direcao' THEN 4
    WHEN lower(coalesce(_profile.plan, '')) = 'transformacao' THEN 8
    ELSE 0
  END;

  IF _action IN ('schedule', 'start_now') THEN
    IF _action = 'schedule' THEN
      IF _scheduled_at IS NULL OR _scheduled_at <= _now THEN RAISE EXCEPTION 'future_time_required' USING ERRCODE = '22023'; END IF;
      IF extract(minute from _scheduled_at AT TIME ZONE 'America/Sao_Paulo')::integer % 15 <> 0 OR extract(second from _scheduled_at)::integer <> 0 THEN
        RAISE EXCEPTION 'invalid_time_interval' USING ERRCODE = '22023';
      END IF;
    ELSE
      _scheduled_at := _now;
      IF _profile.current_session_id IS NOT NULL THEN RAISE EXCEPTION 'active_session_exists' USING ERRCODE = 'P0001'; END IF;
    END IF;

    _month_start := date_trunc('month', _scheduled_at AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
    _next_month := _month_start + interval '1 month';
    SELECT count(*)::integer INTO _used FROM public.sessions
      WHERE user_id = _user_id AND status IN ('scheduled', 'in_progress', 'completed')
      AND quota_exempt = false AND scheduled_at >= _month_start AND scheduled_at < _next_month;
    IF _limit <= 0 OR _used >= _limit THEN RAISE EXCEPTION 'monthly_limit_reached' USING ERRCODE = 'P0001'; END IF;

    INSERT INTO public.sessions (
      user_id, scheduled_at, started_at, status, session_type, duration_minutes, created_by,
      reminder_24h_sent, reminder_5m_sent, confirmation_requested, user_confirmed,
      session_start_notified, waiting_for_scheduled_time
    ) VALUES (
      _user_id, _scheduled_at, CASE WHEN _action = 'start_now' THEN _now ELSE NULL END,
      CASE WHEN _action = 'start_now' THEN 'in_progress'::public.session_status ELSE 'scheduled'::public.session_status END,
      'livre', 45, CASE WHEN _action = 'start_now' THEN 'backend_d0_accept' ELSE 'portal' END,
      false, false, false, NULL, false, _action = 'schedule'
    ) RETURNING * INTO _session;

    IF _action = 'start_now' THEN
      UPDATE public.profiles SET current_session_id = _session.id WHERE user_id = _user_id;
    END IF;

  ELSIF _action = 'start' THEN
    IF _session_id IS NULL THEN RAISE EXCEPTION 'session_required' USING ERRCODE = '22023'; END IF;
    IF _profile.current_session_id IS NOT NULL AND _profile.current_session_id <> _session_id THEN
      RAISE EXCEPTION 'active_session_exists' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO _session FROM public.sessions
      WHERE id = _session_id AND user_id = _user_id AND status IN ('scheduled', 'no_show') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_available' USING ERRCODE = 'P0002'; END IF;
    IF _session.scheduled_at > _now + interval '15 minutes' OR _session.scheduled_at < _now - interval '60 minutes' THEN
      RAISE EXCEPTION 'session_start_unavailable' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.sessions SET status = 'in_progress', started_at = coalesce(started_at, _now), waiting_for_scheduled_time = false
      WHERE id = _session_id RETURNING * INTO _session;
    UPDATE public.profiles SET current_session_id = _session.id WHERE user_id = _user_id;

  ELSIF _action = 'reschedule' THEN
    IF _session_id IS NULL OR _scheduled_at IS NULL OR _scheduled_at <= _now THEN RAISE EXCEPTION 'future_time_required' USING ERRCODE = '22023'; END IF;
    IF extract(minute from _scheduled_at AT TIME ZONE 'America/Sao_Paulo')::integer % 15 <> 0 OR extract(second from _scheduled_at)::integer <> 0 THEN
      RAISE EXCEPTION 'invalid_time_interval' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _session FROM public.sessions WHERE id = _session_id AND user_id = _user_id AND status = 'scheduled' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_available' USING ERRCODE = 'P0002'; END IF;
    IF _session.scheduled_at < _now THEN RAISE EXCEPTION 'session_already_started' USING ERRCODE = 'P0001'; END IF;
    _month_start := date_trunc('month', _scheduled_at AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
    _next_month := _month_start + interval '1 month';
    SELECT count(*)::integer INTO _used FROM public.sessions
      WHERE user_id = _user_id AND id <> _session_id AND status IN ('scheduled', 'in_progress', 'completed')
      AND quota_exempt = false AND scheduled_at >= _month_start AND scheduled_at < _next_month;
    IF NOT _session.quota_exempt AND (_limit <= 0 OR _used >= _limit) THEN RAISE EXCEPTION 'monthly_limit_reached' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.sessions SET scheduled_at = _scheduled_at, reminder_24h_sent = false, reminder_5m_sent = false,
      reminder_1h_sent = false, reminder_15m_sent = false, confirmation_requested = false, user_confirmed = NULL,
      session_start_notified = false, waiting_for_scheduled_time = true
    WHERE id = _session_id RETURNING * INTO _session;

  ELSE
    IF _session_id IS NULL THEN RAISE EXCEPTION 'session_required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO _session FROM public.sessions WHERE id = _session_id AND user_id = _user_id AND status = 'scheduled' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_available' USING ERRCODE = 'P0002'; END IF;
    IF _session.scheduled_at < _now THEN RAISE EXCEPTION 'session_already_started' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.sessions SET status = 'cancelled', waiting_for_scheduled_time = false WHERE id = _session_id RETURNING * INTO _session;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', _action, 'session_id', _session.id, 'scheduled_at', _session.scheduled_at, 'status', _session.status, 'monthly_limit', _limit);
END;
$function$;
