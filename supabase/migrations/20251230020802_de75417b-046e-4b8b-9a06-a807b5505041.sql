-- Tabela para controlar follow-ups de conversas inativas
CREATE TABLE public.conversation_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  followup_count INTEGER NOT NULL DEFAULT 0,
  last_user_message_at TIMESTAMP WITH TIME ZONE,
  last_followup_at TIMESTAMP WITH TIME ZONE,
  conversation_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT unique_user_followup UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.conversation_followups ENABLE ROW LEVEL SECURITY;

-- Policy for service role access (edge functions)
CREATE POLICY "Service role full access on conversation_followups" 
ON public.conversation_followups 
FOR ALL 
USING (auth.role() = 'service_role');

-- Policy for users to view their own followups
CREATE POLICY "Users can view own followups" 
ON public.conversation_followups 
FOR SELECT 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_conversation_followups_updated_at
BEFORE UPDATE ON public.conversation_followups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();