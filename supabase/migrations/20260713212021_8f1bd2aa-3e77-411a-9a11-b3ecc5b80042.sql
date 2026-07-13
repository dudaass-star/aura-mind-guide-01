GRANT SELECT ON public.system_config TO anon;
CREATE POLICY "Anon can read card_gateway only"
ON public.system_config FOR SELECT TO anon
USING (key = 'card_gateway');