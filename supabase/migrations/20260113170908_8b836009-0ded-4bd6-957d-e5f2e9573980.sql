-- Add new columns to journey_episodes for the Manifesto system
ALTER TABLE journey_episodes 
ADD COLUMN IF NOT EXISTS stage_title TEXT,
ADD COLUMN IF NOT EXISTS core_truth TEXT,
ADD COLUMN IF NOT EXISTS manifesto_lines TEXT[],
ADD COLUMN IF NOT EXISTS tool_description TEXT,
ADD COLUMN IF NOT EXISTS tool_prompt TEXT,
ADD COLUMN IF NOT EXISTS hook_to_next TEXT,
ADD COLUMN IF NOT EXISTS context_prompt TEXT,
ADD COLUMN IF NOT EXISTS progression_theme TEXT;