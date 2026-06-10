CREATE TABLE public.session_coverage_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT NOT NULL,
  coverage JSONB NOT NULL,
  overall_score INT,
  diagnosis TEXT,
  red_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX session_coverage_analyses_analyzed_at_idx
  ON public.session_coverage_analyses (analyzed_at DESC);

GRANT SELECT ON public.session_coverage_analyses TO authenticated;
GRANT ALL ON public.session_coverage_analyses TO service_role;

ALTER TABLE public.session_coverage_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ler análises de cobertura"
  ON public.session_coverage_analyses
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));