ALTER TABLE public.aura_response_state
  ADD COLUMN IF NOT EXISTS owner_token uuid,
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;

CREATE TABLE public.chat_turn_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_message_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp')),
  client_sent_at timestamptz,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  first_response_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'processing', 'completed', 'interrupted', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_message_id)
);

GRANT ALL ON public.chat_turn_metrics TO service_role;

ALTER TABLE public.chat_turn_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servicos internos gerenciam metricas de conversa"
  ON public.chat_turn_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX chat_turn_metrics_created_idx
  ON public.chat_turn_metrics(created_at DESC);
CREATE INDEX chat_turn_metrics_status_idx
  ON public.chat_turn_metrics(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_chat_turn_metrics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_chat_turn_metrics_updated_at
BEFORE UPDATE ON public.chat_turn_metrics
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_turn_metrics_updated_at();