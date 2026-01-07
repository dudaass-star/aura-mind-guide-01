-- Adicionar colunas para controle de trial gratuito na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS trial_conversations_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS trial_started_at timestamp with time zone;

-- Comentários explicativos
COMMENT ON COLUMN public.profiles.trial_conversations_count IS 'Contador de conversas usadas no trial gratuito (máx 5)';
COMMENT ON COLUMN public.profiles.trial_started_at IS 'Data/hora de início do trial gratuito';