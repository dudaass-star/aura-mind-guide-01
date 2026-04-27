-- Tabela: resumo evolutivo narrativo do usuário (terceira camada de memória da AURA)
CREATE TABLE public.user_evolution_summary (
  user_id UUID PRIMARY KEY,
  summary_text TEXT NOT NULL,
  last_generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  messages_count_at_generation INTEGER NOT NULL DEFAULT 0,
  generation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_evolution_summary ENABLE ROW LEVEL SECURITY;

-- Service role: acesso total (uso interno pelo aura-agent)
CREATE POLICY "Service role full access on user_evolution_summary"
ON public.user_evolution_summary
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Admin pode ler todos
CREATE POLICY "Admins can read user_evolution_summary"
ON public.user_evolution_summary
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Usuário autenticado pode ler o próprio resumo
CREATE POLICY "Users can read own evolution summary"
ON public.user_evolution_summary
FOR SELECT
USING (auth.uid() = user_id);

-- Portador de token de Portal pode ler resumo do usuário correspondente
CREATE POLICY "Portal token holders can read evolution summary"
ON public.user_evolution_summary
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_portal_tokens upt
    WHERE upt.user_id = user_evolution_summary.user_id
  )
);

-- Trigger para manter updated_at
CREATE TRIGGER update_user_evolution_summary_updated_at
BEFORE UPDATE ON public.user_evolution_summary
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();