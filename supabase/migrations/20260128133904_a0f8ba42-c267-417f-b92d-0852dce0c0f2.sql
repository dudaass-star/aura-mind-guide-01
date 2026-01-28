-- Create table to track chunk generation progress
CREATE TABLE public.meditation_audio_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meditation_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  storage_path TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(meditation_id, chunk_index)
);

-- Enable RLS
ALTER TABLE public.meditation_audio_chunks ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on meditation_audio_chunks"
  ON public.meditation_audio_chunks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Anyone can read (for admin polling)
CREATE POLICY "Anyone can read meditation_audio_chunks"
  ON public.meditation_audio_chunks
  FOR SELECT
  USING (true);

-- Create index for faster queries
CREATE INDEX idx_meditation_audio_chunks_meditation_id 
  ON public.meditation_audio_chunks(meditation_id);

CREATE INDEX idx_meditation_audio_chunks_status 
  ON public.meditation_audio_chunks(status);