
CREATE TABLE public.admin_metrics_snapshots (
  window_key TEXT PRIMARY KEY,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  payload JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  compute_ms INTEGER
);

GRANT SELECT ON public.admin_metrics_snapshots TO authenticated;
GRANT ALL ON public.admin_metrics_snapshots TO service_role;

ALTER TABLE public.admin_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read snapshots"
  ON public.admin_metrics_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
