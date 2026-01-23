-- Tabela para controlar estado de resposta da AURA e preservar contexto interrompido
CREATE TABLE public.aura_response_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_responding BOOLEAN DEFAULT false,
  response_started_at TIMESTAMPTZ,
  last_user_message_id TEXT,
  pending_content TEXT,
  pending_context TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aura_response_state ENABLE ROW LEVEL SECURITY;

-- Política para service role (edge functions)
CREATE POLICY "Service role full access on aura_response_state"
ON public.aura_response_state
FOR ALL
USING (true)
WITH CHECK (true);

-- Índice para buscas rápidas
CREATE INDEX idx_aura_response_state_responding ON public.aura_response_state(user_id) WHERE is_responding = true;