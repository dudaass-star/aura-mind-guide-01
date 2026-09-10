ALTER TABLE public.dunning_attempts
  ADD CONSTRAINT dunning_attempts_delivery_status_valid
  CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'accepted', 'sent', 'delivered', 'read', 'failed', 'undelivered'));