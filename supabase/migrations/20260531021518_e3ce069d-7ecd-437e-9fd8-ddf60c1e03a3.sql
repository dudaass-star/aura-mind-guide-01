CREATE TABLE public.user_portraits (
  user_id uuid PRIMARY KEY,
  intro text,
  pessoas jsonb NOT NULL DEFAULT '[]'::jsonb,
  o_que_te_move jsonb NOT NULL DEFAULT '[]'::jsonb,
  padroes jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  conquistas jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensiveis jsonb NOT NULL DEFAULT '[]'::jsonb,
  insights_version text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_portraits TO authenticated;
GRANT ALL ON public.user_portraits TO service_role;

ALTER TABLE public.user_portraits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_portraits"
ON public.user_portraits
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read user_portraits"
ON public.user_portraits
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read own portrait"
ON public.user_portraits
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Portal token holders can read portrait"
ON public.user_portraits
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_portal_tokens upt
    WHERE upt.user_id = user_portraits.user_id
  )
);

CREATE TRIGGER update_user_portraits_updated_at
BEFORE UPDATE ON public.user_portraits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();