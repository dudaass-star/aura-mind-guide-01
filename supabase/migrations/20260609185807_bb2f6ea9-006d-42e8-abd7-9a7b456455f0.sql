
DROP POLICY IF EXISTS "blog covers publicly readable" ON storage.objects;
CREATE POLICY "blog covers publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS "service role manages blog covers" ON storage.objects;
CREATE POLICY "service role manages blog covers" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'blog-covers') WITH CHECK (bucket_id = 'blog-covers');
