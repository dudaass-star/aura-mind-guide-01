-- Add column to track if user needs to setup monthly schedule
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS needs_schedule_setup boolean DEFAULT false;