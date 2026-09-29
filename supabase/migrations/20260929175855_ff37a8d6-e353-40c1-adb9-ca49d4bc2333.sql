CREATE TABLE public.demo_access_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_access_invites_future_expiry CHECK (expires_at > created_at)
);

GRANT ALL ON public.demo_access_invites TO service_role;

ALTER TABLE public.demo_access_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX demo_access_invites_profile_idx ON public.demo_access_invites (profile_id, expires_at DESC);
CREATE INDEX demo_access_invites_active_idx ON public.demo_access_invites (token_hash) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_demo_access_invites_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_demo_access_invites_updated_at
BEFORE UPDATE ON public.demo_access_invites
FOR EACH ROW EXECUTE FUNCTION public.update_demo_access_invites_updated_at();