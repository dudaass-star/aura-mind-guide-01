-- Backfill trial_conversations_count para usuários do funil (inclui PIX/ativos
-- que nunca tiveram o contador incrementado porque o gate antigo exigia status='trial').
-- Conta apenas mensagens 'user' enviadas a partir do trial_started_at.
WITH counts AS (
  SELECT
    p.id AS profile_id,
    COUNT(m.id)::int AS real_count
  FROM public.profiles p
  LEFT JOIN public.messages m
    ON m.user_id = p.user_id
   AND m.role = 'user'
   AND m.created_at >= p.trial_started_at
  WHERE p.trial_started_at IS NOT NULL
  GROUP BY p.id
)
UPDATE public.profiles p
   SET trial_conversations_count = c.real_count
  FROM counts c
 WHERE p.id = c.profile_id
   AND c.real_count > COALESCE(p.trial_conversations_count, 0);