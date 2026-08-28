ALTER TABLE public.recovery_conversations
  ADD COLUMN IF NOT EXISTS pending_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_inbound text;

CREATE INDEX IF NOT EXISTS idx_recovery_conversations_pending
  ON public.recovery_conversations (pending_reply_at)
  WHERE pending_reply_at IS NOT NULL;

UPDATE public.recovery_agent_config SET max_auto_replies = 8 WHERE id = 1;