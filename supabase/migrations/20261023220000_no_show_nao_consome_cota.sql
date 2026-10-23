-- Sessão perdida por atraso (no_show) não consome a cota mensal; aplicado via replace na função.
DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.manage_portal_session_internal(uuid,text,timestamptz,uuid)'::regprocedure) INTO d;
d := replace(d, $q$status IN ('scheduled', 'in_progress', 'completed', 'no_show')$q$, $q$status IN ('scheduled', 'in_progress', 'completed')$q$);
EXECUTE d; END $$;
