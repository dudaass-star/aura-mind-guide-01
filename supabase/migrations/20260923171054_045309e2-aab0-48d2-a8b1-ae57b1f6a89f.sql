DO $$
DECLARE
  _definition text;
  _pause_block text := E'\n  IF _action <> ''cancel''\n    AND _profile.sessions_paused_until IS NOT NULL\n    AND _profile.sessions_paused_until >= (_now AT TIME ZONE ''America/Sao_Paulo'')::date THEN\n    RAISE EXCEPTION ''sessions_paused'' USING ERRCODE = ''P0001'';\n  END IF;\n';
BEGIN
  SELECT pg_get_functiondef('public.manage_portal_session_internal(uuid,text,timestamp with time zone,uuid)'::regprocedure)
  INTO _definition;
  IF position(_pause_block IN _definition) = 0 THEN
    RAISE EXCEPTION 'Bloco de pausa esperado não encontrado';
  END IF;
  EXECUTE replace(_definition, _pause_block, E'\n');
END;
$$;