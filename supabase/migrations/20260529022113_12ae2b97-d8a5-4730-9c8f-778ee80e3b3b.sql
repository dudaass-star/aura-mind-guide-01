CREATE POLICY "Admins can read all sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));