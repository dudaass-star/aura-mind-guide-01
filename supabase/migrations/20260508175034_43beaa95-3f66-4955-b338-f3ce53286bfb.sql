ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT 'aura_tag';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS extractor_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extractor_pending_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON public.sessions(created_by);