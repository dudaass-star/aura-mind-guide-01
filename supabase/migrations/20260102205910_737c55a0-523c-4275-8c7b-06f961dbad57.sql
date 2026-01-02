-- Add audio_sent_count column to sessions table for tracking audio messages during session
ALTER TABLE public.sessions ADD COLUMN audio_sent_count INTEGER DEFAULT 0;