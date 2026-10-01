REVOKE EXECUTE ON FUNCTION public.mark_movement_started() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_movement_continued() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_movement_started() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_movement_continued() TO service_role;

CREATE OR REPLACE FUNCTION public.movement_safe_name(_name text, _mode text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE _mode WHEN 'full_name' THEN _name WHEN 'first_name' THEN split_part(_name, ' ', 1) WHEN 'initials' THEN (SELECT string_agg(left(part, 1) || '.', ' ') FROM unnest(regexp_split_to_array(_name, '\s+')) part) ELSE 'Participante do Movimento' END
$$;