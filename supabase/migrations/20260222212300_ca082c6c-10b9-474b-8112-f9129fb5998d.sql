
CREATE TABLE public.token_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  function_name TEXT NOT NULL,
  call_type TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (internal monitoring data)
-- No policies for anon/authenticated = no access for them
