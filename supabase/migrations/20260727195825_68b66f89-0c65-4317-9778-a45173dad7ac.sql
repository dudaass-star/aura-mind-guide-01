ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS messages_used_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages_reset_month TEXT,
  ADD COLUMN IF NOT EXISTS tier_limit_notified_month TEXT;

COMMENT ON COLUMN public.profiles.messages_used_this_month IS 'Mensagens do usuario no mes corrente. Usado apenas para a cota do plan_tier = base (30/mes).';
COMMENT ON COLUMN public.profiles.messages_reset_month IS 'YYYY-MM do ultimo reset de messages_used_this_month.';
COMMENT ON COLUMN public.profiles.tier_limit_notified_month IS 'YYYY-MM em que ja foi enviado aviso/parede de cota do tier base, para nao repetir.';