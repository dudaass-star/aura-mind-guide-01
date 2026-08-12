CREATE TABLE public.meta_identity_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text,
  phone text,
  fbp text,
  fbc text,
  last_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meta_identity_cache TO service_role;

ALTER TABLE public.meta_identity_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view meta identity cache"
ON public.meta_identity_cache
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX meta_identity_cache_email_key
  ON public.meta_identity_cache (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX meta_identity_cache_phone_key
  ON public.meta_identity_cache (phone) WHERE phone IS NOT NULL;

CREATE TRIGGER update_meta_identity_cache_updated_at
BEFORE UPDATE ON public.meta_identity_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();