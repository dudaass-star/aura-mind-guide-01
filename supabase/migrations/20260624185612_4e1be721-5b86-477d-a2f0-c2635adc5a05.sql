DROP POLICY IF EXISTS "Admins can update meditations bucket" ON storage.objects;
CREATE POLICY "Admins can update meditations bucket"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'meditations' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'meditations' AND public.has_role(auth.uid(), 'admin'::public.app_role));