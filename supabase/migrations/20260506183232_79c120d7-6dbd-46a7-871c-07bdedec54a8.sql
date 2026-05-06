-- Prevenção de sessões duplicadas: trigger BEFORE INSERT
-- Bloqueia INSERT se já existir sessão scheduled/active para o mesmo user
-- com scheduled_at dentro de uma janela de 30 minutos.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_sessions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.status NOT IN ('scheduled', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO conflict_id
  FROM public.sessions
  WHERE user_id = NEW.user_id
    AND status IN ('scheduled', 'active')
    AND scheduled_at BETWEEN (NEW.scheduled_at - interval '30 minutes')
                         AND (NEW.scheduled_at + interval '30 minutes')
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_session_window: já existe sessão % próxima de %', conflict_id, NEW.scheduled_at
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_sessions ON public.sessions;
CREATE TRIGGER trg_prevent_duplicate_sessions
BEFORE INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_sessions();