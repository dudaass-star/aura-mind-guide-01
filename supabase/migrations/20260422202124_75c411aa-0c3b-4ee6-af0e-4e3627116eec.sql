-- Bucket público para áudios TTS da Aura
INSERT INTO storage.buckets (id, name, public)
VALUES ('aura-tts-audios', 'aura-tts-audios', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (Twilio baixa o MP3 da URL)
CREATE POLICY "Public read access on aura-tts-audios"
ON storage.objects FOR SELECT
USING (bucket_id = 'aura-tts-audios');