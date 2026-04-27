-- ============================================================================
-- Detecção determinística de cliques em botões de templates Twilio
-- ============================================================================

-- 1) Tabela canônica que mapeia template -> conteúdo entregue ao clicar
CREATE TABLE public.template_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE,
  content_sid   TEXT NOT NULL UNIQUE,
  button_text   TEXT NOT NULL,
  delivers_content_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on template_definitions"
  ON public.template_definitions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read template_definitions"
  ON public.template_definitions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_template_definitions_updated_at
  BEFORE UPDATE ON public.template_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índice case-insensitive para casamento por button_text
CREATE INDEX idx_template_definitions_button_text_ci
  ON public.template_definitions (lower(button_text))
  WHERE is_active = true;

-- 2) Captura do MessageSid do template enviado (pra casar com OriginalRepliedMessageSid no clique)
ALTER TABLE public.weekly_questions
  ADD COLUMN trigger_message_sid TEXT;

ALTER TABLE public.monthly_letters
  ADD COLUMN trigger_message_sid TEXT;

CREATE INDEX idx_weekly_questions_trigger_sid
  ON public.weekly_questions(trigger_message_sid)
  WHERE trigger_message_sid IS NOT NULL;

CREATE INDEX idx_monthly_letters_trigger_sid
  ON public.monthly_letters(trigger_message_sid)
  WHERE trigger_message_sid IS NOT NULL;

-- 3) Cleanup da instrumentação de debug (concluída)
DROP TABLE IF EXISTS public.webhook_payload_debug;