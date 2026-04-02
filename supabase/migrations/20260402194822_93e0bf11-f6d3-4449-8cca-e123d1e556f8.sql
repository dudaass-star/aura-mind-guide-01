CREATE TABLE public.failed_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  phone TEXT,
  content TEXT NOT NULL,
  error TEXT,
  function_name TEXT NOT NULL DEFAULT 'unknown',
  retry_count INTEGER NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.failed_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on failed_message_log"
  ON public.failed_message_log FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read failed_message_log"
  ON public.failed_message_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_failed_message_log_created ON public.failed_message_log(created_at DESC);
CREATE INDEX idx_failed_message_log_unresolved ON public.failed_message_log(resolved) WHERE resolved = false;