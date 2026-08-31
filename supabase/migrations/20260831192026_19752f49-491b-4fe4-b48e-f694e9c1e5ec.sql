ALTER TABLE public.taster_offers
  ADD COLUMN IF NOT EXISTS profile_user_id uuid,
  ADD COLUMN IF NOT EXISTS converted_plan text,
  ADD COLUMN IF NOT EXISTS paid_value_cents integer,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS taster_offered_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS taster_source text;