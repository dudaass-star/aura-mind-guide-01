-- ========================================
-- Melhorias do Agente AURA
-- ========================================

-- 1. Adicionar coluna para rastrear última reativação enviada
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_reactivation_sent timestamp with time zone DEFAULT NULL;

-- 2. Adicionar coluna para rastrear se rating foi solicitado na sessão
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS rating_requested boolean DEFAULT false;

-- 3. Criar tabela para ratings de sessão
CREATE TABLE IF NOT EXISTS public.session_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_ratings ENABLE ROW LEVEL SECURITY;

-- Policies para session_ratings
CREATE POLICY "Service role full access on session_ratings"
ON public.session_ratings
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own ratings"
ON public.session_ratings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ratings"
ON public.session_ratings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Index para busca rápida
CREATE INDEX IF NOT EXISTS idx_session_ratings_session_id ON public.session_ratings(session_id);
CREATE INDEX IF NOT EXISTS idx_session_ratings_user_id ON public.session_ratings(user_id);

-- 4. Criar tabela para feedback de cancelamento
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  phone text NOT NULL,
  reason text NOT NULL,
  reason_detail text,
  action_taken text NOT NULL CHECK (action_taken IN ('paused', 'canceled', 'retained')),
  pause_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

-- Policies para cancellation_feedback
CREATE POLICY "Service role full access on cancellation_feedback"
ON public.cancellation_feedback
FOR ALL
USING (auth.role() = 'service_role');

-- Index para busca
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_phone ON public.cancellation_feedback(phone);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_user_id ON public.cancellation_feedback(user_id);

-- 5. Adicionar index para busca de usuários inativos (otimização)
CREATE INDEX IF NOT EXISTS idx_profiles_last_message_date ON public.profiles(last_message_date);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);