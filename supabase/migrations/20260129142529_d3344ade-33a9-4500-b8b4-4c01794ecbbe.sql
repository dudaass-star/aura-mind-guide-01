-- Permitir updates anônimos na tabela meditation_audios (para admin page)
CREATE POLICY "Allow anonymous update on meditation_audios"
ON public.meditation_audios
FOR UPDATE
USING (true);

-- Permitir inserts anônimos na tabela meditation_audios (para admin page)
CREATE POLICY "Allow anonymous insert on meditation_audios"
ON public.meditation_audios
FOR INSERT
WITH CHECK (true);

-- Permitir deletes anônimos na tabela meditation_audios (para admin page)
CREATE POLICY "Allow anonymous delete on meditation_audios"
ON public.meditation_audios
FOR DELETE
USING (true);