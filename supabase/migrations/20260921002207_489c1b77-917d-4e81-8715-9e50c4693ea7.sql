CREATE POLICY "Clientes enviam os próprios áudios da conversa"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-audios'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Clientes ouvem os próprios áudios da conversa"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-audios'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Clientes removem os próprios áudios da conversa"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-audios'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Serviço processa áudios da conversa"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'chat-audios')
WITH CHECK (bucket_id = 'chat-audios');

CREATE INDEX IF NOT EXISTS messages_in_app_created_idx
ON public.messages (user_id, created_at DESC)
WHERE channel = 'in_app';