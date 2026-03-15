ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_phase text DEFAULT 'listening';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_aha_at_count integer;