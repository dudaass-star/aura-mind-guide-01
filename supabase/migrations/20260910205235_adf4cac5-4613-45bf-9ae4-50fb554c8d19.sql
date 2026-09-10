UPDATE public.dunning_attempts
SET delivery_status = 'undelivered'
WHERE error_stage = 'twilio_delivery_failed'
  AND delivery_status IS DISTINCT FROM 'undelivered';