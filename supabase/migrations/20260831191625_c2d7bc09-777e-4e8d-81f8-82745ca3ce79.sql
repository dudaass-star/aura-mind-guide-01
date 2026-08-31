DROP INDEX IF EXISTS public.taster_offers_correlation_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS taster_offers_correlation_uniq
  ON public.taster_offers (charge_correlation_id);