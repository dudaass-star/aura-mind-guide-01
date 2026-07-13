
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_gateway text
  CHECK (card_gateway IN ('stripe','asaas'));

INSERT INTO public.system_config (key, value)
VALUES ('card_gateway', '"stripe"'::jsonb)
ON CONFLICT (key) DO NOTHING;
