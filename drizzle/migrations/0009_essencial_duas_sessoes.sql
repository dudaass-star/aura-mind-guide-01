-- Essencial passa a ter 2 encontros por mês (quinzenal).
UPDATE public.plan_configs SET sessions_per_month = 2 WHERE plan_id = 'essencial';--> statement-breakpoint
DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'manage_portal_session_internal';
  IF position($s$= 'essencial' THEN 1$s$ in _def) > 0 THEN
    EXECUTE replace(_def, $s$= 'essencial' THEN 1$s$, $s$= 'essencial' THEN 2$s$);
  END IF;
END
$mig$;
