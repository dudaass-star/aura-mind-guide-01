CREATE OR REPLACE FUNCTION public.apply_degustacao_session_rules()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _status text;
  _interrupted integer;
BEGIN
  SELECT lower(coalesce(status, '')) INTO _status FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  IF _status IS DISTINCT FROM 'degustacao' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    -- Cortesia só é consumida por encontro ativo ou concluído com diálogo; interrupções liberam recomeço (máx. 2).
    SELECT count(*) INTO _interrupted FROM public.sessions s
      WHERE s.user_id = NEW.user_id AND s.quota_exempt_reason = 'degustacao_gratuita'
        AND (s.status = 'no_show' OR (s.status = 'completed' AND s.closure_mode IN ('unilateral', 'no_show')));
    IF NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = NEW.user_id AND s.quota_exempt_reason = 'degustacao_gratuita'
        AND s.status NOT IN ('cancelled', 'no_show')
        AND NOT (s.status = 'completed' AND coalesce(s.closure_mode, '') IN ('unilateral', 'no_show'))
    ) AND _interrupted < 3 THEN
      NEW.quota_exempt := true;
      NEW.quota_exempt_reason := 'degustacao_gratuita';
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