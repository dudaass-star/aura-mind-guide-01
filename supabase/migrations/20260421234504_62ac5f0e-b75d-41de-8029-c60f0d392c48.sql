-- ============================================================================
-- SUPPORT SYSTEM TABLES
-- ============================================================================

-- 1. support_tickets
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  category TEXT,
  severity TEXT,
  profile_user_id UUID,
  imap_message_id TEXT UNIQUE,
  in_reply_to TEXT,
  email_references TEXT,
  snooze_until TIMESTAMP WITH TIME ZONE,
  last_inbound_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_outbound_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX idx_support_tickets_customer_email ON public.support_tickets(customer_email);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read support_tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update support_tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on support_tickets"
  ON public.support_tickets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. support_ticket_messages
CREATE TABLE public.support_ticket_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  headers JSONB DEFAULT '{}'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  message_id_header TEXT,
  in_reply_to TEXT,
  sent_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_messages_ticket_id ON public.support_ticket_messages(ticket_id, created_at);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read support_ticket_messages"
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on support_ticket_messages"
  ON public.support_ticket_messages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. support_ticket_drafts
CREATE TABLE public.support_ticket_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  ai_model TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  suggested_action JSONB DEFAULT '{}'::jsonb,
  context_snapshot JSONB DEFAULT '{}'::jsonb,
  hint TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_drafts_ticket_id ON public.support_ticket_drafts(ticket_id, generated_at DESC);

ALTER TABLE public.support_ticket_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read support_ticket_drafts"
  ON public.support_ticket_drafts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on support_ticket_drafts"
  ON public.support_ticket_drafts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. support_ticket_actions
CREATE TABLE public.support_ticket_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  executed_by UUID,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  stripe_response JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT
);

CREATE INDEX idx_support_ticket_actions_ticket_id ON public.support_ticket_actions(ticket_id, executed_at DESC);

ALTER TABLE public.support_ticket_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read support_ticket_actions"
  ON public.support_ticket_actions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on support_ticket_actions"
  ON public.support_ticket_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can read support attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage support attachments"
  ON storage.objects FOR ALL
  USING (bucket_id = 'support-attachments' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'support-attachments' AND auth.role() = 'service_role');