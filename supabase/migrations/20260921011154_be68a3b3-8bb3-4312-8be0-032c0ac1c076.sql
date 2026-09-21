ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_user_channel_source_unique
  ON public.messages(user_id, channel, source_message_id)
  WHERE source_message_id IS NOT NULL;