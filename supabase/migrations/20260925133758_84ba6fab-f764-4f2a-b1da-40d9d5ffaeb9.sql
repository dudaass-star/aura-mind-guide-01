CREATE OR REPLACE FUNCTION public.has_portal_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND lower(coalesce(p.status, '')) IN ('active', 'trial', 'past_due', 'payment_failed', 'canceling', 'taster')
      AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
  );
$function$;