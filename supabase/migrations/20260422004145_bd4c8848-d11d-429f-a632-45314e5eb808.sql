-- ============ TABELA NOVA: support_kb_gaps ============
CREATE TABLE public.support_kb_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  ticket_subject TEXT,
  best_kb_score DOUBLE PRECISION,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','ignored')),
  source_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  resolved_kb_id UUID REFERENCES public.support_knowledge_base(id) ON DELETE SET NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_gaps_status ON public.support_kb_gaps(status, last_seen_at DESC);
CREATE INDEX idx_kb_gaps_occurrence ON public.support_kb_gaps(occurrence_count DESC) WHERE status = 'open';

ALTER TABLE public.support_kb_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read kb_gaps" ON public.support_kb_gaps FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update kb_gaps" ON public.support_kb_gaps FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete kb_gaps" ON public.support_kb_gaps FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access on kb_gaps" ON public.support_kb_gaps FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============ DRAFTS: campos de feedback ============
ALTER TABLE public.support_ticket_drafts
  ADD COLUMN IF NOT EXISTS feedback_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (feedback_status IN ('pending','approved_no_edit','approved_with_edit','rejected','auto_sent')),
  ADD COLUMN IF NOT EXISTS edit_distance DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS final_body TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drafts_feedback ON public.support_ticket_drafts(feedback_status, generated_at DESC);

-- ============ KB: contadores de performance ============
ALTER TABLE public.support_knowledge_base
  ADD COLUMN IF NOT EXISTS approved_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count INTEGER NOT NULL DEFAULT 0;

-- ============ TICKETS: controle de reabertura ============
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS auto_reply_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_reopened ON public.support_tickets(reopened_at DESC) WHERE reopened_at IS NOT NULL;

-- ============ FUNÇÃO: registrar feedback nos artigos KB ============
CREATE OR REPLACE FUNCTION public.record_kb_feedback(
  kb_ids UUID[],
  feedback TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF kb_ids IS NULL OR array_length(kb_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF feedback = 'approved_no_edit' OR feedback = 'auto_sent' THEN
    UPDATE public.support_knowledge_base
       SET approved_count = approved_count + 1
     WHERE id = ANY(kb_ids);
  ELSIF feedback = 'approved_with_edit' THEN
    UPDATE public.support_knowledge_base
       SET edited_count = edited_count + 1
     WHERE id = ANY(kb_ids);
  ELSIF feedback = 'rejected' THEN
    UPDATE public.support_knowledge_base
       SET rejected_count = rejected_count + 1
     WHERE id = ANY(kb_ids);
  END IF;
END;
$$;

-- ============ FUNÇÃO: registrar gap de KB ============
CREATE OR REPLACE FUNCTION public.record_kb_gap(
  _question TEXT,
  _subject TEXT,
  _best_score DOUBLE PRECISION,
  _ticket_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  new_id UUID;
BEGIN
  -- Procura gap aberto similar (mesmas primeiras 80 chars normalizadas)
  SELECT id INTO existing_id
    FROM public.support_kb_gaps
   WHERE status = 'open'
     AND lower(left(question_text, 80)) = lower(left(_question, 80))
   LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.support_kb_gaps
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = now()
     WHERE id = existing_id;
    RETURN existing_id;
  END IF;

  INSERT INTO public.support_kb_gaps (question_text, ticket_subject, best_kb_score, source_ticket_id)
  VALUES (_question, _subject, _best_score, _ticket_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;