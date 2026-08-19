UPDATE public.profiles
SET status = 'canceled',
    canceled_at = COALESCE(canceled_at, now()),
    plan_expires_at = timestamptz '2026-08-19 15:15:27+00'
WHERE phone = '554174015961';