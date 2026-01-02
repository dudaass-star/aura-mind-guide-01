-- Add reminder columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS confirmation_requested boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_confirmed boolean DEFAULT null;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS post_session_sent boolean DEFAULT false;