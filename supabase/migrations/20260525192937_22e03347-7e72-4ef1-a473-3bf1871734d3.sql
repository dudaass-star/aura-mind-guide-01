-- Kill switches para fluxos de envio WhatsApp (investigação Twilio)
INSERT INTO public.system_config (key, value) VALUES
  ('twilio_recovery_enabled', 'true'::jsonb),
  ('zapi_send_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Backfill: marca como skipped qualquer linha pendente cujo telefone
-- já recebeu >=2 envios outbound de recovery (lifetime cap)
WITH phone_counts AS (
  SELECT regexp_replace(phone, '\D', '', 'g') AS norm, COUNT(*) AS c
  FROM public.recovery_messages
  WHERE direction = 'out' AND sent_by_admin = false
  GROUP BY 1
  HAVING COUNT(*) >= 2
),
capped AS (
  SELECT norm FROM phone_counts
)
UPDATE public.checkout_sessions cs
SET whatsapp_recovery_15min_sent_at = COALESCE(cs.whatsapp_recovery_15min_sent_at, now()),
    whatsapp_recovery_24h_sent_at   = COALESCE(cs.whatsapp_recovery_24h_sent_at, now()),
    whatsapp_recovery_last_error    = 'cleanup: phone_lifetime_cap'
WHERE regexp_replace(cs.phone, '\D', '', 'g') IN (SELECT norm FROM capped)
  AND cs.status = 'created'
  AND (cs.whatsapp_recovery_15min_sent_at IS NULL OR cs.whatsapp_recovery_24h_sent_at IS NULL);

WITH phone_counts AS (
  SELECT regexp_replace(phone, '\D', '', 'g') AS norm, COUNT(*) AS c
  FROM public.recovery_messages
  WHERE direction = 'out' AND sent_by_admin = false
  GROUP BY 1
  HAVING COUNT(*) >= 2
)
UPDATE public.asaas_payments ap
SET whatsapp_recovery_15min_sent_at = COALESCE(ap.whatsapp_recovery_15min_sent_at, now()),
    whatsapp_recovery_24h_sent_at   = COALESCE(ap.whatsapp_recovery_24h_sent_at, now()),
    whatsapp_recovery_last_error    = 'cleanup: phone_lifetime_cap'
WHERE regexp_replace(ap.customer_phone, '\D', '', 'g') IN (SELECT norm FROM phone_counts)
  AND ap.status = 'PENDING'
  AND (ap.whatsapp_recovery_15min_sent_at IS NULL OR ap.whatsapp_recovery_24h_sent_at IS NULL);

-- Também bloqueia retentativas para telefones que falharam (Twilio cobra mesmo no fail)
WITH failed_phones AS (
  SELECT DISTINCT phone_normalized AS norm
  FROM public.checkout_recovery_attempts
  WHERE status LIKE 'wa_%failed' AND phone_normalized IS NOT NULL
)
UPDATE public.checkout_sessions cs
SET whatsapp_recovery_15min_sent_at = COALESCE(cs.whatsapp_recovery_15min_sent_at, now()),
    whatsapp_recovery_24h_sent_at   = COALESCE(cs.whatsapp_recovery_24h_sent_at, now()),
    whatsapp_recovery_last_error    = 'cleanup: phone_failed_lifetime'
WHERE regexp_replace(cs.phone, '\D', '', 'g') IN (SELECT norm FROM failed_phones)
  AND cs.status = 'created'
  AND (cs.whatsapp_recovery_15min_sent_at IS NULL OR cs.whatsapp_recovery_24h_sent_at IS NULL);

WITH failed_phones AS (
  SELECT DISTINCT phone_normalized AS norm
  FROM public.checkout_recovery_attempts
  WHERE status LIKE 'wa_%failed' AND phone_normalized IS NOT NULL
)
UPDATE public.asaas_payments ap
SET whatsapp_recovery_15min_sent_at = COALESCE(ap.whatsapp_recovery_15min_sent_at, now()),
    whatsapp_recovery_24h_sent_at   = COALESCE(ap.whatsapp_recovery_24h_sent_at, now()),
    whatsapp_recovery_last_error    = 'cleanup: phone_failed_lifetime'
WHERE regexp_replace(ap.customer_phone, '\D', '', 'g') IN (SELECT norm FROM failed_phones)
  AND ap.status = 'PENDING'
  AND (ap.whatsapp_recovery_15min_sent_at IS NULL OR ap.whatsapp_recovery_24h_sent_at IS NULL);