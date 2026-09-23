ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS journey_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS journey_selected_goal text;

ALTER TABLE public.user_journey_history
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS confirmation_source text NOT NULL DEFAULT 'legacy_delivery',
  ADD COLUMN IF NOT EXISTS episode_reached integer;

ALTER TABLE public.user_journey_history
  DROP CONSTRAINT IF EXISTS user_journey_history_status_check;
ALTER TABLE public.user_journey_history
  ADD CONSTRAINT user_journey_history_status_check
  CHECK (status IN ('completed', 'switched', 'abandoned'));

CREATE TABLE public.journey_episode_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  journey_id text NOT NULL REFERENCES public.content_journeys(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.journey_episodes(id) ON DELETE CASCADE,
  episode_number integer NOT NULL CHECK (episode_number > 0),
  status text NOT NULL DEFAULT 'released' CHECK (status IN ('released', 'in_progress', 'completed')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  released_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  last_read_at timestamptz,
  completed_at timestamptz,
  reflection_text text CHECK (reflection_text IS NULL OR char_length(reflection_text) <= 2000),
  reflection_saved_at timestamptz,
  discussed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, episode_id)
);

GRANT SELECT, INSERT, UPDATE ON public.journey_episode_progress TO authenticated;
GRANT ALL ON public.journey_episode_progress TO service_role;

ALTER TABLE public.journey_episode_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes veem o próprio progresso das jornadas"
ON public.journey_episode_progress FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Clientes registram o próprio progresso das jornadas"
ON public.journey_episode_progress FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clientes atualizam o próprio progresso das jornadas"
ON public.journey_episode_progress FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX journey_episode_progress_user_status_idx
ON public.journey_episode_progress (user_id, status, released_at DESC);

CREATE INDEX journey_episode_progress_journey_episode_idx
ON public.journey_episode_progress (user_id, journey_id, episode_number);

CREATE TRIGGER update_journey_episode_progress_updated_at
BEFORE UPDATE ON public.journey_episode_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.journey_episode_progress (
  user_id, journey_id, episode_id, episode_number, status, progress_percent, released_at
)
SELECT p.user_id, je.journey_id, je.id, je.episode_number, 'released', 0,
       COALESCE(p.last_content_sent_at, p.created_at, now())
FROM public.profiles p
JOIN public.journey_episodes je
  ON je.journey_id = p.current_journey_id
 AND je.episode_number <= COALESCE(p.current_episode, 0)
WHERE p.current_journey_id IS NOT NULL
ON CONFLICT (user_id, episode_id) DO NOTHING;