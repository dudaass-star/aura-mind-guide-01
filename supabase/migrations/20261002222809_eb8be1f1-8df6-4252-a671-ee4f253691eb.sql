ALTER TABLE public.chat_turn_metrics
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS performance_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chat_turn_metrics.model IS 'Modelo principal usado para gerar a resposta do turno.';
COMMENT ON COLUMN public.chat_turn_metrics.performance_breakdown IS 'Tempos internos por etapa do processamento da resposta, em milissegundos.';