
-- Tabela de tarefas agendadas
CREATE TABLE public.scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  execute_at TIMESTAMPTZ NOT NULL,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on scheduled_tasks"
  ON public.scheduled_tasks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own scheduled_tasks"
  ON public.scheduled_tasks FOR SELECT
  USING (auth.uid() = user_id);

-- Índice parcial para performance do cron
CREATE INDEX idx_scheduled_tasks_pending 
  ON public.scheduled_tasks (execute_at) 
  WHERE status = 'pending';

-- Função RPC atômica com FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_pending_tasks(max_tasks INT DEFAULT 150)
RETURNS SETOF public.scheduled_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_tasks
  SET status = 'executing'
  WHERE id IN (
    SELECT id FROM public.scheduled_tasks
    WHERE status = 'pending' AND execute_at <= now()
    ORDER BY execute_at ASC
    LIMIT max_tasks
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
