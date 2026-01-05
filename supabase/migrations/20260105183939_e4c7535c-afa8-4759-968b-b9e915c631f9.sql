-- Create session_themes table for tracking theme evolution
CREATE TABLE public.session_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  theme_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, progressing, resolved, recurring
  first_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_count INTEGER NOT NULL DEFAULT 1,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_themes ENABLE ROW LEVEL SECURITY;

-- RLS policies for session_themes
CREATE POLICY "Users can view own themes" ON public.session_themes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own themes" ON public.session_themes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own themes" ON public.session_themes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on session_themes" ON public.session_themes
  FOR ALL USING (auth.role() = 'service_role');

-- Add new columns to commitments table
ALTER TABLE public.commitments 
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id),
  ADD COLUMN IF NOT EXISTS commitment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0;