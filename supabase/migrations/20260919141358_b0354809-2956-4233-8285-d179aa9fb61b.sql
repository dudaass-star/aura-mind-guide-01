CREATE TABLE public.portal_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  email_hash text,
  action_hash text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','sent','awaiting_reply','failed','rate_limited')),
  delivery_provider text,
  delivery_message_id text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  sent_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_access_requests TO service_role;
ALTER TABLE public.portal_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages portal access requests"
ON public.portal_access_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
CREATE INDEX portal_access_requests_phone_created_idx
ON public.portal_access_requests (phone_hash, created_at DESC);
CREATE INDEX portal_access_requests_profile_created_idx
ON public.portal_access_requests (profile_id, created_at DESC);
CREATE TRIGGER update_portal_access_requests_updated_at
BEFORE UPDATE ON public.portal_access_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();