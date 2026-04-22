-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table
CREATE TABLE public.support_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  embedding vector(768),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for vector similarity search (cosine)
CREATE INDEX support_kb_embedding_idx
  ON public.support_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX support_kb_category_idx ON public.support_knowledge_base(category);
CREATE INDEX support_kb_active_idx ON public.support_knowledge_base(is_active);

-- Enable RLS
ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read kb"
  ON public.support_knowledge_base FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert kb"
  ON public.support_knowledge_base FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update kb"
  ON public.support_knowledge_base FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete kb"
  ON public.support_knowledge_base FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on support_kb"
  ON public.support_knowledge_base FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_support_kb_updated_at
  BEFORE UPDATE ON public.support_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Search function (cosine similarity)
CREATE OR REPLACE FUNCTION public.match_support_kb(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  question TEXT,
  answer TEXT,
  keywords TEXT[],
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.category,
    kb.question,
    kb.answer,
    kb.keywords,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.support_knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- Helper to increment usage_count atomically
CREATE OR REPLACE FUNCTION public.increment_kb_usage(kb_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_knowledge_base
  SET usage_count = usage_count + 1
  WHERE id = ANY(kb_ids);
END;
$$;