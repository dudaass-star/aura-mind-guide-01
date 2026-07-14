
CREATE TABLE public.thematic_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  theme TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  snapshot_before TEXT,
  snapshot_change TEXT,
  evidence_quote TEXT,
  evidence_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  evidence_date TIMESTAMPTZ,
  message_count_in_period INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL CHECK (confidence IN ('high','low','insufficient_data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, theme, period_start)
);

CREATE INDEX idx_thematic_snapshots_user_period ON public.thematic_snapshots (user_id, period_start DESC);
CREATE INDEX idx_thematic_snapshots_user_theme ON public.thematic_snapshots (user_id, theme);

GRANT SELECT ON public.thematic_snapshots TO authenticated;
GRANT ALL ON public.thematic_snapshots TO service_role;

ALTER TABLE public.thematic_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own thematic snapshots"
  ON public.thematic_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all thematic snapshots"
  ON public.thematic_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_thematic_snapshots_updated_at
  BEFORE UPDATE ON public.thematic_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
