CREATE TABLE public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access" ON public.system_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access" ON public.system_config
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.system_config (key, value)
VALUES ('ai_model', '"google/gemini-2.5-pro"');