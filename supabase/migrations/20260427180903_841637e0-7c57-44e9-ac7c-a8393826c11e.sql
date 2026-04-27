-- Tabela de correções de memória do usuário (verdades de prioridade máxima)
CREATE TABLE IF NOT EXISTS public.user_memory_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  correction_text text NOT NULL,
  source text,
  confidence integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_memory_corrections_user
  ON public.user_memory_corrections (user_id, created_at DESC);

ALTER TABLE public.user_memory_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_memory_corrections"
  ON public.user_memory_corrections
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own memory corrections"
  ON public.user_memory_corrections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all memory corrections"
  ON public.user_memory_corrections
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));