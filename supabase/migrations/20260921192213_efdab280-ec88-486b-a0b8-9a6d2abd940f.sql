ALTER TABLE public.push_devices
ADD COLUMN is_foreground boolean NOT NULL DEFAULT false;