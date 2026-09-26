ALTER TABLE public.portal_value_events DROP CONSTRAINT portal_value_events_feature_check;
ALTER TABLE public.portal_value_events ADD CONSTRAINT portal_value_events_feature_check CHECK (feature IN ('conversation', 'session', 'journey', 'practice', 'progress', 'profile', 'today', 'app'));
CREATE POLICY "Administradores acompanham abertura pela tela inicial"
ON public.portal_value_events FOR SELECT TO authenticated
USING (feature = 'app' AND event_type = 'standalone_opened' AND public.has_role(auth.uid(), 'admin'));