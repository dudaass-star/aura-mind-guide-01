ALTER TABLE public.instagram_config
ADD COLUMN meta_access_token TEXT,
ADD COLUMN token_expires_at TIMESTAMPTZ;