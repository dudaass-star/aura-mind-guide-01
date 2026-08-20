-- Reabre a recuperação dos leads silenciados por engano pela guarda Woovi
-- (status ACTIVE da assinatura era lido como mandato autorizado).
UPDATE public.checkout_sessions
   SET whatsapp_recovery_15min_sent_at = NULL,
       whatsapp_recovery_last_error = 'reopened: guard_false_positive'
 WHERE id IN (
   'ab216134-d83f-420e-983b-e79a636918fb',
   'd033d4b4-9f6a-4ba2-9f43-cc8b3e6df890',
   '96a0d91c-6693-44a0-94f5-99d097f225c4'
 );

UPDATE public.checkout_sessions
   SET whatsapp_recovery_24h_sent_at = NULL,
       whatsapp_recovery_last_error = 'reopened: guard_false_positive'
 WHERE id IN (
   'e68b1789-7cad-425f-a41b-d36cc8da0e50',
   'f3f701c2-4403-4284-a96a-3894b22cb1ba'
 );