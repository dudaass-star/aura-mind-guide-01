
-- Instagram interactions log
CREATE TABLE public.instagram_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_user_id text NOT NULL,
  ig_username text,
  interaction_type text NOT NULL, -- 'comment' or 'dm'
  original_text text NOT NULL,
  response_text text,
  post_id text,
  comment_id text,
  sentiment text, -- 'positive', 'negative', 'neutral', 'question'
  responded boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on instagram_interactions"
  ON public.instagram_interactions FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read instagram_interactions"
  ON public.instagram_interactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_instagram_interactions_created ON public.instagram_interactions(created_at DESC);
CREATE INDEX idx_instagram_interactions_type ON public.instagram_interactions(interaction_type);

-- Instagram config (single row)
CREATE TABLE public.instagram_config (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  ig_account_id text,
  response_enabled boolean NOT NULL DEFAULT true,
  comment_response_enabled boolean NOT NULL DEFAULT true,
  dm_response_enabled boolean NOT NULL DEFAULT true,
  comment_keywords text[] DEFAULT '{}'::text[],
  max_daily_responses integer NOT NULL DEFAULT 100,
  daily_count integer NOT NULL DEFAULT 0,
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on instagram_config"
  ON public.instagram_config FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read instagram_config"
  ON public.instagram_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update instagram_config"
  ON public.instagram_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert default config row
INSERT INTO public.instagram_config (id) VALUES (1);
