ALTER TABLE public.sessions ADD COLUMN quota_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN quota_exempt_reason text;
COMMENT ON COLUMN public.sessions.quota_exempt IS 'Sessão compensada administrativamente: preserva histórico, mas não consome a cota mensal.';
CREATE FUNCTION public.protect_session_quota_compensation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.quota_exempt OR NEW.quota_exempt_reason IS NOT NULL)) OR (TG_OP = 'UPDATE' AND (NEW.quota_exempt IS DISTINCT FROM OLD.quota_exempt OR NEW.quota_exempt_reason IS DISTINCT FROM OLD.quota_exempt_reason)) THEN
    IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Compensação de sessão exige autorização administrativa' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_session_quota_compensation BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.protect_session_quota_compensation();
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.manage_portal_session_internal(uuid,text,timestamptz,uuid)'::regprocedure) INTO definition;
  IF position('AND scheduled_at >= _month_start AND scheduled_at < _next_month' in definition) = 0 THEN RAISE EXCEPTION 'Contagem mensal esperada não encontrada'; END IF;
  definition := replace(definition, 'AND scheduled_at >= _month_start AND scheduled_at < _next_month', 'AND quota_exempt = false AND scheduled_at >= _month_start AND scheduled_at < _next_month');
  EXECUTE definition;
END;
$$;