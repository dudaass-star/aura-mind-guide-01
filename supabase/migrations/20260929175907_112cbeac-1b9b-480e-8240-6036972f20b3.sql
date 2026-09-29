CREATE POLICY "Somente servico administra convites demo"
ON public.demo_access_invites
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);