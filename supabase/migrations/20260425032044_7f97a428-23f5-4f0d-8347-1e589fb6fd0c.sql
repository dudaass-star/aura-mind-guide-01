-- ============================================================
-- Sistema de Retenção Ofensiva: Linha do Tempo + Carta Mensal + Pergunta da Semana
-- ============================================================

-- 1. user_milestones — Marcos significativos da jornada do usuário
CREATE TABLE public.user_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  milestone_text TEXT NOT NULL,
  milestone_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'aura_realtime',
  context_excerpt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_milestones_user_date ON public.user_milestones(user_id, milestone_date DESC);

ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own milestones"
  ON public.user_milestones FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_milestones"
  ON public.user_milestones FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Portal token holders can read milestones"
  ON public.user_milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_portal_tokens upt
    WHERE upt.user_id = user_milestones.user_id
  ));

-- ============================================================
-- 2. monthly_letters — Carta mensal da Aura ao usuário
-- ============================================================
CREATE TABLE public.monthly_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  letter_month DATE NOT NULL,
  letter_text TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, letter_month)
);

CREATE INDEX idx_monthly_letters_user_month ON public.monthly_letters(user_id, letter_month DESC);

ALTER TABLE public.monthly_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own letters"
  ON public.monthly_letters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on monthly_letters"
  ON public.monthly_letters FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Portal token holders can read letters"
  ON public.monthly_letters FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_portal_tokens upt
    WHERE upt.user_id = monthly_letters.user_id
  ));

-- ============================================================
-- 3. weekly_questions — Pergunta da semana e resposta do usuário
-- ============================================================
CREATE TABLE public.weekly_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  question_date DATE NOT NULL,
  response_text TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_date)
);

CREATE INDEX idx_weekly_questions_user_date ON public.weekly_questions(user_id, question_date DESC);

ALTER TABLE public.weekly_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly questions"
  ON public.weekly_questions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on weekly_questions"
  ON public.weekly_questions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Portal token holders can read weekly questions"
  ON public.weekly_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_portal_tokens upt
    WHERE upt.user_id = weekly_questions.user_id
  ));