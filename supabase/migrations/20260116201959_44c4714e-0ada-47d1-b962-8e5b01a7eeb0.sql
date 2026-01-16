-- Add essay_content column to journey_episodes for the new deep essay format
ALTER TABLE public.journey_episodes 
ADD COLUMN IF NOT EXISTS essay_content TEXT;