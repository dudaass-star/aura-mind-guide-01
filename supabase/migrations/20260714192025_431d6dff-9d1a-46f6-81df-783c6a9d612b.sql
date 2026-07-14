CREATE POLICY "Users can insert own memory corrections"
ON public.user_memory_corrections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);