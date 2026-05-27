
CREATE OR REPLACE FUNCTION public.increment_recovery_kb_usage(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE public.recovery_knowledge_base
     SET usage_count = usage_count + 1
   WHERE id = ANY(_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_recovery_kb_usage(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_recovery_kb_usage(uuid[]) TO service_role;
