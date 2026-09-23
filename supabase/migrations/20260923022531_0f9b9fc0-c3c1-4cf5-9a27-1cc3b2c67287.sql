ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_app_invite_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.last_app_invite_sent_at IS
'Último convite reativo enviado pelo WhatsApp para continuar a conversa no aplicativo Olá Aura.';

CREATE INDEX IF NOT EXISTS profiles_last_app_invite_sent_at_idx
ON public.profiles (last_app_invite_sent_at)
WHERE last_app_invite_sent_at IS NOT NULL;