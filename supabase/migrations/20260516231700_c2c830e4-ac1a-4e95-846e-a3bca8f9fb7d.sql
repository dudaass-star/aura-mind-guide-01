CREATE POLICY "Admins can read session_ratings"
ON public.session_ratings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));