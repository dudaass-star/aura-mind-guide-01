CREATE OR REPLACE FUNCTION public.prevent_duplicate_sessions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO conflict_id
  FROM public.sessions
  WHERE user_id = NEW.user_id
    AND status IN ('scheduled', 'in_progress')
    AND scheduled_at BETWEEN (NEW.scheduled_at - interval '30 minutes')
                         AND (NEW.scheduled_at + interval '30 minutes')
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_session_window: já existe sessão % próxima de %', conflict_id, NEW.scheduled_at
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;