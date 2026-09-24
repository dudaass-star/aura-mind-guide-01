DROP POLICY IF EXISTS "Portal token holders can read portrait" ON public.user_portraits;

CREATE TABLE public.user_portrait_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  section text NOT NULL CHECK (section IN ('intro', 'pessoas', 'o_que_te_move', 'padroes', 'preferencias', 'sensiveis')),
  original_text text NOT NULL,
  source_kind text NOT NULL DEFAULT 'aura_inference' CHECK (source_kind IN ('aura_inference', 'user_declared')),
  status text NOT NULL CHECK (status IN ('confirmed', 'corrected', 'removed')),
  corrected_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_portrait_feedback_item_unique UNIQUE (user_id, item_key),
  CONSTRAINT user_portrait_feedback_correction_check CHECK (
    (status = 'corrected' AND corrected_text IS NOT NULL AND char_length(btrim(corrected_text)) BETWEEN 1 AND 800)
    OR (status IN ('confirmed', 'removed') AND corrected_text IS NULL)
  )
);
GRANT SELECT ON public.user_portrait_feedback TO authenticated;
GRANT ALL ON public.user_portrait_feedback TO service_role;
ALTER TABLE public.user_portrait_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clientes veem as próprias validações do retrato"
ON public.user_portrait_feedback FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Serviço gerencia validações do retrato"
ON public.user_portrait_feedback FOR ALL TO service_role
USING (true) WITH CHECK (true);
CREATE INDEX user_portrait_feedback_user_updated_idx
ON public.user_portrait_feedback (user_id, updated_at DESC);
CREATE TRIGGER update_user_portrait_feedback_updated_at
BEFORE UPDATE ON public.user_portrait_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();