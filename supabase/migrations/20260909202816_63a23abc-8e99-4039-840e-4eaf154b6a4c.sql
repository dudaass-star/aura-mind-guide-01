UPDATE public.profiles
   SET card_gateway = 'stripe',
       plan = 'essencial',
       billing_cycle = 'yearly',
       status = 'active',
       plan_tier = NULL,
       payment_failed_at = NULL,
       pix_consent_lost_at = NULL,
       plan_expires_at = '2027-09-09 20:04:13+00',
       updated_at = now()
 WHERE id = 'ef894fb2-e305-4109-98a3-a1e6779706c1';

UPDATE public.woovi_subscriptions
   SET status = 'CANCELADA',
       replaced_by_subscription_id = 'stripe:sub_1UDrj7QU15XnZ7VvJVfLjXhB',
       last_error = 'migrado para cartão (anual, 09/09/2026)',
       updated_at = now()
 WHERE user_id = 'ef894fb2-e305-4109-98a3-a1e6779706c1';

UPDATE public.scheduled_tasks
   SET status = 'cancelled', executed_at = now()
 WHERE status = 'pending'
   AND task_type LIKE 'woovi_%'
   AND user_id = (SELECT user_id FROM public.profiles WHERE id = 'ef894fb2-e305-4109-98a3-a1e6779706c1');