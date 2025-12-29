-- Tabela de insights/memória de longo prazo sobre cada usuário
CREATE TABLE public.user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('pessoa', 'objetivo', 'padrao', 'conquista', 'trauma', 'preferencia', 'contexto')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  mentioned_count INTEGER DEFAULT 1,
  last_mentioned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Evita duplicatas
  UNIQUE(user_id, category, key)
);

-- Habilitar RLS
ALTER TABLE public.user_insights ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view own insights" ON public.user_insights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights" ON public.user_insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights" ON public.user_insights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights" ON public.user_insights
  FOR DELETE USING (auth.uid() = user_id);

-- Política para service role (Edge Functions) poder acessar
CREATE POLICY "Service role full access" ON public.user_insights
  FOR ALL USING (auth.role() = 'service_role');

-- Índice para buscas rápidas
CREATE INDEX idx_user_insights_user_id ON public.user_insights(user_id);
CREATE INDEX idx_user_insights_category ON public.user_insights(user_id, category);

-- Comentários para documentação
COMMENT ON TABLE public.user_insights IS 'Memória de longo prazo da AURA sobre cada usuário';
COMMENT ON COLUMN public.user_insights.category IS 'Tipo: pessoa, objetivo, padrao, conquista, trauma, preferencia, contexto';
COMMENT ON COLUMN public.user_insights.key IS 'Identificador único do insight (ex: nome_chefe, medo_principal)';
COMMENT ON COLUMN public.user_insights.value IS 'Valor do insight (ex: Carlos, medo de abandono)';
COMMENT ON COLUMN public.user_insights.importance IS 'Importância de 1-10 para priorização no contexto';
COMMENT ON COLUMN public.user_insights.mentioned_count IS 'Quantas vezes o usuário mencionou isso';