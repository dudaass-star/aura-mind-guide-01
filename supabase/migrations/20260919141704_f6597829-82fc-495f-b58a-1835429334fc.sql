CREATE OR REPLACE FUNCTION public.consume_portal_access_request(_action_hash text)
RETURNS TABLE(request_id uuid, profile_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portal_access_requests
  SET used_at = now(), updated_at = now()
  WHERE action_hash = _action_hash
    AND used_at IS NULL
    AND expires_at > now()
    AND status = 'sent'
  RETURNING id, profile_id;
$$;
REVOKE ALL ON FUNCTION public.consume_portal_access_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_portal_access_request(text) TO service_role;