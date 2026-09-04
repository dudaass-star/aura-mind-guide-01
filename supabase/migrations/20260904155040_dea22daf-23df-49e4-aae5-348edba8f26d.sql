ALTER TABLE public.taster_offers
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS qr_image_url text;

CREATE UNIQUE INDEX IF NOT EXISTS taster_offers_public_token_key
  ON public.taster_offers (public_token) WHERE public_token IS NOT NULL;