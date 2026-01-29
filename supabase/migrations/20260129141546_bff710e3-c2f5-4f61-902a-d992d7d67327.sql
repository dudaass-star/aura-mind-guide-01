-- Permitir uploads anônimos no bucket meditations (para admin page)
CREATE POLICY "Allow anonymous upload to meditations bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'meditations');