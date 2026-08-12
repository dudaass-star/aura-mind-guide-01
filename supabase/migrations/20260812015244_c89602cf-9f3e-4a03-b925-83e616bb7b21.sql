DROP POLICY IF EXISTS "Anon can read card_gateway only" ON public.system_config;

CREATE POLICY "Anon can read checkout gateway config"
ON public.system_config
FOR SELECT
TO anon
USING (key IN ('card_gateway', 'pix_gateway', 'pix_rail_status'));