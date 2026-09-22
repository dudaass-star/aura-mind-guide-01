GRANT SELECT ON public.user_journey_history TO authenticated;
GRANT ALL ON public.user_journey_history TO service_role;

DROP POLICY IF EXISTS "Users can view own journey history" ON public.user_journey_history;
CREATE POLICY "Users can view own journey history"
ON public.user_journey_history
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);