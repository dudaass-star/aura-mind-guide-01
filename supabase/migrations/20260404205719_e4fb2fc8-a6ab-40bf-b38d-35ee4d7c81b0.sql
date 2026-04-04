
-- 1. user_portal_tokens
CREATE TABLE public.user_portal_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_portal_tokens_user_id_unique UNIQUE (user_id),
  CONSTRAINT user_portal_tokens_token_unique UNIQUE (token)
);

ALTER TABLE public.user_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read portal tokens by token value"
  ON public.user_portal_tokens FOR SELECT
  USING (true);

CREATE POLICY "Service role full access on user_portal_tokens"
  ON public.user_portal_tokens FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- 2. monthly_reports
CREATE TABLE public.monthly_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  report_month date NOT NULL,
  metrics_json jsonb DEFAULT '{}'::jsonb,
  analysis_text text,
  report_html text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT monthly_reports_user_month_unique UNIQUE (user_id, report_month)
);

ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on monthly_reports"
  ON public.monthly_reports FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Anyone can read monthly reports"
  ON public.monthly_reports FOR SELECT
  USING (true);

-- 3. Add reminder_5m_sent to sessions
ALTER TABLE public.sessions
  ADD COLUMN reminder_5m_sent boolean DEFAULT false;
