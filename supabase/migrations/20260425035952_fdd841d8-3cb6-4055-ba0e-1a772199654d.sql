-- Pergunta da Semana: rastreia quando o texto da pergunta foi efetivamente entregue
-- (sent_at = template gatilho 'cheking_7dias' enviado; delivered_at = pergunta entregue na janela aberta)
ALTER TABLE public.weekly_questions
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Carta Mensal: separa template gatilho do conteúdo real
ALTER TABLE public.monthly_letters
  ADD COLUMN IF NOT EXISTS trigger_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Índices para a query de "entrega pendente" do webhook
CREATE INDEX IF NOT EXISTS idx_weekly_questions_pending_delivery
  ON public.weekly_questions (user_id, sent_at DESC)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_letters_pending_delivery
  ON public.monthly_letters (user_id, trigger_sent_at DESC)
  WHERE delivered_at IS NULL;