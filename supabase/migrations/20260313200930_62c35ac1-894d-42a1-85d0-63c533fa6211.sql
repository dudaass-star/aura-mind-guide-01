ALTER TABLE public.profiles ADD COLUMN audio_seconds_used_this_month integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN audio_reset_date date DEFAULT NULL;