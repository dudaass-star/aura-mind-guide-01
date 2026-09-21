CREATE TABLE public.checkout_access_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid REFERENCES public.checkout_sessions(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  gateway text NOT NULL CHECK (gateway IN ('stripe', 'asaas', 'inter', 'woovi')),
  provider_reference text,
  email text NOT NULL,
  phone text NOT NULL,
  name text,
  plan text NOT NULL,
  billing text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'paid', 'failed', 'expired', 'consumed')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.checkout_access_claims TO service_role;
ALTER TABLE public.checkout_access_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages checkout access claims"
ON public.checkout_access_claims FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX checkout_access_claims_provider_ref_idx
ON public.checkout_access_claims (gateway, provider_reference)
WHERE provider_reference IS NOT NULL;
CREATE INDEX checkout_access_claims_pending_expiry_idx
ON public.checkout_access_claims (status, expires_at);
CREATE INDEX checkout_access_claims_profile_idx
ON public.checkout_access_claims (profile_id, created_at DESC);

CREATE TRIGGER update_checkout_access_claims_updated_at
BEFORE UPDATE ON public.checkout_access_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_portal_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND lower(coalesce(p.status, '')) IN ('active', 'trial', 'past_due', 'payment_failed', 'taster')
      AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_portal_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_portal_entitlement(uuid) TO authenticated, service_role;