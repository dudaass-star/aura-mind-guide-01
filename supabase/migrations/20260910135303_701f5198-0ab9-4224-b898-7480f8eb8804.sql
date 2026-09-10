CREATE TABLE public.woovi_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id TEXT NOT NULL UNIQUE,
  dispute_type TEXT NOT NULL DEFAULT 'MED',
  status TEXT,
  end_to_end_id TEXT,
  user_id UUID,
  profile_id UUID,
  customer_name TEXT,
  value_cents INTEGER,
  charge_id UUID REFERENCES public.woovi_charges(id) ON DELETE SET NULL,
  subscription_id TEXT,
  dispute_reason TEXT,
  defense_decision TEXT,
  defense_summary JSONB,
  evidence_sent_at TIMESTAMP WITH TIME ZONE,
  evidence_error TEXT,
  evidence_attempts INTEGER NOT NULL DEFAULT 0,
  resolution TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.woovi_disputes TO authenticated;
GRANT ALL ON public.woovi_disputes TO service_role;

ALTER TABLE public.woovi_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver disputas"
ON public.woovi_disputes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_woovi_disputes_updated_at
BEFORE UPDATE ON public.woovi_disputes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_woovi_disputes_e2e ON public.woovi_disputes(end_to_end_id);
CREATE INDEX idx_woovi_disputes_created ON public.woovi_disputes(created_at DESC);