-- Permitir update de arquivos no bucket meditations
CREATE POLICY "Allow anonymous update in meditations bucket"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'meditations');

-- Permitir delete de arquivos no bucket meditations
CREATE POLICY "Allow anonymous delete in meditations bucket"
ON storage.objects
FOR DELETE
USING (bucket_id = 'meditations');