UPDATE public.asaas_payments
SET asaas_subscription_id = raw_payload->>'subscription'
WHERE asaas_subscription_id IS NULL
  AND raw_payload->>'subscription' IS NOT NULL;

UPDATE public.asaas_pix_authorizations a
SET asaas_subscription_id = p.asaas_subscription_id
FROM public.asaas_payments p
WHERE a.asaas_subscription_id IS NULL
  AND a.status = 'ACTIVE'
  AND p.asaas_customer_id = a.asaas_customer_id
  AND p.asaas_subscription_id IS NOT NULL;