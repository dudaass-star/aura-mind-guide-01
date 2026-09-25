ALTER TABLE public.portal_access_requests
ADD COLUMN destination text NOT NULL DEFAULT 'conversar'
CHECK (destination IN ('conversar', 'sessoes', 'hoje'));

ALTER TABLE public.profiles
ADD COLUMN whatsapp_app_migration_sent_at timestamptz,
ADD COLUMN whatsapp_app_redirect_last_sent_at timestamptz,
ADD COLUMN whatsapp_app_redirect_count integer NOT NULL DEFAULT 0;

DROP FUNCTION public.consume_portal_access_request(text);

CREATE FUNCTION public.consume_portal_access_request(_action_hash text)
RETURNS TABLE(request_id uuid, profile_id uuid, destination text)
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
  RETURNING id, profile_id, destination;
$$;

REVOKE ALL ON FUNCTION public.consume_portal_access_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_portal_access_request(text) TO service_role;