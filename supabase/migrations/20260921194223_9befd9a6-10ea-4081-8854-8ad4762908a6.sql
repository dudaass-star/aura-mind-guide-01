REVOKE INSERT ON public.push_notification_events FROM authenticated;
DROP POLICY IF EXISTS "Clientes registram os próprios eventos de notificação" ON public.push_notification_events;