UPDATE public.profiles
SET plan = 'essencial',
    billing_cycle = 'quarterly',
    status = 'active',
    plan_tier = NULL,
    payment_failed_at = NULL,
    updated_at = now()
WHERE email = 'beatriz.sottomaior@gmail.com';