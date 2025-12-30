-- Add service role policy to zapi_message_dedup table
CREATE POLICY "Service role can manage dedup records"
ON public.zapi_message_dedup
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');