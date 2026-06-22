ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS audio_mirror_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.audio_mirror_enabled IS 'Quando true, a Aura responde em áudio sempre que o usuário envia áudio (respeitando o teto mensal). Piloto individual antes de virar regra global.';