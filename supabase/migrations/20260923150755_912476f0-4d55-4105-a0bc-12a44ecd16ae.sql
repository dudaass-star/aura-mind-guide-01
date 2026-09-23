REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.sessions TO authenticated;
GRANT ALL ON TABLE public.sessions TO service_role;

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;