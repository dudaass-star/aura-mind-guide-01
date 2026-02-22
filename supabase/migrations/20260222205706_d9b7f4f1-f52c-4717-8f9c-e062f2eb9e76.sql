-- Add sessions_paused_until column for flexible session pausing
ALTER TABLE public.profiles ADD COLUMN sessions_paused_until DATE;

-- Fix Eduardo Santos: stop persistent scheduling prompts
UPDATE public.profiles SET needs_schedule_setup = false WHERE name ILIKE '%Eduardo%Santos%';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';