ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS client_message_id uuid,
  ADD COLUMN IF NOT EXISTS sequence_no bigserial,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_channel_check CHECK (channel IN ('whatsapp', 'in_app', 'system')),
  ADD CONSTRAINT messages_delivery_status_check CHECK (delivery_status IN ('sending', 'sent', 'delivered', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS messages_user_client_message_unique
  ON public.messages(user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS messages_sequence_no_unique
  ON public.messages(sequence_no);
CREATE INDEX IF NOT EXISTS messages_user_sequence_desc
  ON public.messages(user_id, sequence_no DESC);

GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.messages_sequence_no_seq TO service_role;

DROP POLICY IF EXISTS "Users can insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Clientes veem as próprias mensagens"
  ON public.messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.aura_response_state TO authenticated;
GRANT ALL ON public.aura_response_state TO service_role;
CREATE POLICY "Clientes acompanham a própria resposta"
  ON public.aura_response_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.aura_response_state REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'aura_response_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_response_state;
  END IF;
END $$;