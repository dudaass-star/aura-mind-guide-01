CREATE TABLE public.portal_value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL CHECK (feature IN ('conversation','session','journey','practice','progress','profile')),
  event_type text NOT NULL CHECK (event_type IN ('presented','opened','experienced','repeated')),
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','push','whatsapp','system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.portal_value_events TO authenticated;
GRANT ALL ON public.portal_value_events TO service_role;
ALTER TABLE public.portal_value_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes veem a própria descoberta de valor"
ON public.portal_value_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Clientes registram a própria descoberta de valor"
ON public.portal_value_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE INDEX portal_value_events_user_feature_created_idx
ON public.portal_value_events (user_id, feature, created_at DESC);
CREATE UNIQUE INDEX portal_value_events_once_idx
ON public.portal_value_events (user_id, feature, event_type)
WHERE event_type IN ('presented','opened','experienced');