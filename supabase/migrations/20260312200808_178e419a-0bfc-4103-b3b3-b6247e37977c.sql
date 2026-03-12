ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS schedule_reminder_first_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_reminder_urgent_sent_at timestamptz DEFAULT NULL;