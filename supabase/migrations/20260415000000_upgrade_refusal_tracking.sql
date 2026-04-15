-- Rastreamento de recusas de upgrade diferenciado por tipo
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upgrade_refusal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upgrade_refusal_type text;

COMMENT ON COLUMN public.profiles.upgrade_refusal_count IS 'Número de vezes que o usuário recusou upgrade proativo. >= 3 desativa sugestões proativas permanentemente.';
COMMENT ON COLUMN public.profiles.upgrade_refusal_type IS 'Tipo da última recusa: financial (60d cooldown), timing (21d cooldown), no_response (30d cooldown)';
