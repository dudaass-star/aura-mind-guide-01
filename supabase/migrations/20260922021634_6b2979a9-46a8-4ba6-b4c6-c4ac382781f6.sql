CREATE TABLE public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  previous_period_start date NOT NULL,
  previous_period_end date NOT NULL,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  highlights_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysis_text text,
  continuation_text text,
  report_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_reports_user_period_unique UNIQUE (user_id, period_start),
  CONSTRAINT weekly_reports_period_order CHECK (period_start <= period_end),
  CONSTRAINT weekly_reports_previous_period_order CHECK (previous_period_start <= previous_period_end)
);

GRANT SELECT ON public.weekly_reports TO authenticated;
GRANT ALL ON public.weekly_reports TO service_role;

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes visualizam os próprios resumos semanais"
ON public.weekly_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Serviço gerencia resumos semanais"
ON public.weekly_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX weekly_reports_user_period_idx
ON public.weekly_reports (user_id, period_start DESC);

CREATE TRIGGER weekly_reports_updated_at
BEFORE UPDATE ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();