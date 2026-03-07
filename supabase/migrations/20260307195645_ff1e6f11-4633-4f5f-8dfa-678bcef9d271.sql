
-- Add time capsule fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS awaiting_time_capsule text DEFAULT null,
  ADD COLUMN IF NOT EXISTS pending_capsule_audio_url text DEFAULT null;

-- Create time_capsules table
CREATE TABLE public.time_capsules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  audio_url text NOT NULL,
  transcription text,
  context_message text,
  deliver_at timestamptz NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.time_capsules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on time_capsules"
  ON public.time_capsules FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view own time_capsules"
  ON public.time_capsules FOR SELECT
  USING (auth.uid() = user_id);
