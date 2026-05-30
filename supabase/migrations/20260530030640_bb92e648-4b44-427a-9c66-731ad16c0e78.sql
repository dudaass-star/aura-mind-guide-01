
-- Fase 1 do redesign /meu-espaco: campos do "Cardápio de Fechamento" em sessões
-- Permite que o card "O que ficou da última sessão" mostre título e ação contextuais ao formato.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS closure_type TEXT,
  ADD COLUMN IF NOT EXISTS closure_text TEXT,
  ADD COLUMN IF NOT EXISTS reframe_text TEXT,
  ADD COLUMN IF NOT EXISTS theme_label TEXT;

-- Documentação dos valores aceitos (não enum p/ permitir evolução do session-extractor sem migration)
COMMENT ON COLUMN public.sessions.closure_type IS
  'Formato do fechamento (Cardápio de Fechamento): tese | encruzilhada | leitura | experimento | pergunta-pra-carregar | escolha-binaria | micro-passo. Nullable.';
COMMENT ON COLUMN public.sessions.closure_text IS
  'Texto curto do fechamento entregue pela Aura (frase/pergunta/proposta). Populado pelo session-extractor.';
COMMENT ON COLUMN public.sessions.reframe_text IS
  'Síntese do reframe da sessão. Populado pelo session-extractor.';
COMMENT ON COLUMN public.sessions.theme_label IS
  'Rótulo curto do tema central da sessão. Populado pelo session-extractor.';

-- Índice leve para puxar a última sessão concluída do usuário
CREATE INDEX IF NOT EXISTS sessions_user_completed_ended_idx
  ON public.sessions (user_id, ended_at DESC)
  WHERE status = 'completed';
