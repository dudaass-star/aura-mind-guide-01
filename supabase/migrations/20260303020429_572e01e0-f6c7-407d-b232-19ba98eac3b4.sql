
-- Fix 1: aura_response_state - replace overly permissive USING(true) with service_role restriction
DROP POLICY IF EXISTS "Service role full access on aura_response_state" ON public.aura_response_state;

CREATE POLICY "Service role full access on aura_response_state"
ON public.aura_response_state
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Fix 2: token_usage_logs - add service_role policy (RLS enabled but no policies existed)
CREATE POLICY "Service role full access on token_usage_logs"
ON public.token_usage_logs
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);
