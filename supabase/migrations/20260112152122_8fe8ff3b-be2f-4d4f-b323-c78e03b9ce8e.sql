-- Add waiting_for_scheduled_time column to sessions table
-- This tracks when a user explicitly requested to be called at the scheduled time
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS waiting_for_scheduled_time BOOLEAN DEFAULT false;