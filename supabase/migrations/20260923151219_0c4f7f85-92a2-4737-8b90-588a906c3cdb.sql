REVOKE INSERT, UPDATE, DELETE ON TABLE public.session_ratings FROM anon, authenticated;
GRANT SELECT ON TABLE public.session_ratings TO authenticated;
GRANT ALL ON TABLE public.session_ratings TO service_role;

DROP POLICY IF EXISTS "Users can insert own ratings" ON public.session_ratings;