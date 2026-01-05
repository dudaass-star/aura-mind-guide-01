-- Adicionar campos de onboarding ao perfil
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS therapy_experience text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS main_challenges text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expectations text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_support_style text;