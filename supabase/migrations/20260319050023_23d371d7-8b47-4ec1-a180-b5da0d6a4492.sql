CREATE TABLE public.gemini_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  cache_name text NOT NULL,
  prompt_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT gemini_cache_model_hash_unique UNIQUE (model, prompt_hash)
);
ALTER TABLE public.gemini_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on gemini_cache"
  ON public.gemini_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');