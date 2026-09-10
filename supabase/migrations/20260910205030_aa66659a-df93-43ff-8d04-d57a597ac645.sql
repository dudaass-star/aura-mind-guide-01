UPDATE public.dunning_attempts
SET delivery_status = CASE
  WHEN error_stage = 'twilio_delivery_failed' THEN 'undelivered'
  ELSE delivery_status
END
WHERE delivery_status IS NULL
  AND error_stage = 'twilio_delivery_failed';