
-- Conversas do número de recuperação (agrupadas por telefone)
CREATE TABLE public.recovery_conversations (
  phone TEXT PRIMARY KEY,
  name TEXT,
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_admin_read_at TIMESTAMPTZ,
  checkout_session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_conversations_last_inbound ON public.recovery_conversations(last_inbound_at DESC NULLS LAST);

ALTER TABLE public.recovery_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read recovery_conversations"
  ON public.recovery_conversations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update recovery_conversations"
  ON public.recovery_conversations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on recovery_conversations"
  ON public.recovery_conversations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_recovery_conversations_updated_at
  BEFORE UPDATE ON public.recovery_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mensagens individuais (in/out)
CREATE TABLE public.recovery_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body TEXT,
  media_url TEXT,
  message_sid TEXT UNIQUE,
  sent_by_admin BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_messages_phone_created ON public.recovery_messages(phone, created_at DESC);

ALTER TABLE public.recovery_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read recovery_messages"
  ON public.recovery_messages FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on recovery_messages"
  ON public.recovery_messages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.recovery_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recovery_messages;
ALTER TABLE public.recovery_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.recovery_messages REPLICA IDENTITY FULL;
