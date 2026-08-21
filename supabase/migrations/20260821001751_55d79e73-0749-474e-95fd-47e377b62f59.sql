-- Reclassifica falhas de recuperação por WhatsApp causadas pela nossa própria
-- infraestrutura (credencial Twilio, remetente mal configurado, parâmetro inválido).
-- Elas saem do padrão 'wa_%failed' e portanto deixam de banir o telefone.
UPDATE public.checkout_recovery_attempts
SET status = replace(status, 'failed', 'infra_error')
WHERE status LIKE 'wa_%failed'
  AND (
    error_message ILIKE '%authenticate%'
    OR error_message ILIKE '%could not find a Channel%'
    OR error_message ILIKE '%Invalid Parameter%'
    OR error_message ILIKE '%unauthorized%'
    OR error_message ILIKE '%internal server error%'
    OR error_message ILIKE '%service unavailable%'
  );

-- Libera o registro da Maria Aparecida (checkout 20/08 19:38 BRT, PIX não pago)
-- para que o próximo ciclo dispare o lembrete de recuperação.
UPDATE public.checkout_sessions
SET whatsapp_recovery_15min_sent_at = NULL,
    whatsapp_recovery_last_error = NULL
WHERE id = 'af9da7e7-bbfb-4d15-85ee-b20f53a8d266'
  AND status <> 'completed';