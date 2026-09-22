CREATE TABLE public.journey_reflection_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('thematic_snapshot', 'active_theme')),
  source_id text NOT NULL,
  response text NOT NULL CHECK (response IN ('agrees', 'corrects')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_kind, source_id)
);

GRANT SELECT, INSERT, UPDATE ON public.journey_reflection_feedback TO authenticated;
GRANT ALL ON public.journey_reflection_feedback TO service_role;

ALTER TABLE public.journey_reflection_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes veem as próprias validações do percurso"
ON public.journey_reflection_feedback FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Clientes registram as próprias validações do percurso"
ON public.journey_reflection_feedback FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clientes atualizam as próprias validações do percurso"
ON public.journey_reflection_feedback FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX journey_reflection_feedback_user_created_idx
ON public.journey_reflection_feedback (user_id, created_at DESC);

CREATE TRIGGER update_journey_reflection_feedback_updated_at
BEFORE UPDATE ON public.journey_reflection_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();