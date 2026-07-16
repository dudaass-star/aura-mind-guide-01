
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS closure_mode TEXT,
  ADD COLUMN IF NOT EXISTS last_user_emotional_state TEXT,
  ADD COLUMN IF NOT EXISTS had_dated_bridge BOOLEAN,
  ADD COLUMN IF NOT EXISTS commitment_confirmed BOOLEAN;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_closure_mode_check
  CHECK (closure_mode IS NULL OR closure_mode IN ('dialogada','unilateral','pausa','no_show'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_interaction_closure_state TEXT,
  ADD COLUMN IF NOT EXISTS last_interaction_closure_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_last_interaction_closure_state_check
  CHECK (last_interaction_closure_state IS NULL OR last_interaction_closure_state IN (
    'fechada_tranquila',
    'fechada_com_direcao',
    'aberta_com_pergunta',
    'aberta_vulneravel',
    'aberta_em_silencio'
  ));

CREATE INDEX IF NOT EXISTS idx_profiles_closure_state
  ON public.profiles(last_interaction_closure_state)
  WHERE last_interaction_closure_state IS NOT NULL;
