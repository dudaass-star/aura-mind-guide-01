CREATE UNIQUE INDEX scheduled_tasks_first14_batch_unique_idx
ON public.scheduled_tasks (task_type, (payload->>'run_key'), (payload->>'cursor'))
WHERE task_type = 'first14_batch';

CREATE INDEX profiles_first14_created_idx
ON public.profiles (created_at, user_id)
WHERE status IN ('active', 'trial', 'trialing');

CREATE INDEX profiles_first14_converted_idx
ON public.profiles (converted_at, user_id)
WHERE status IN ('active', 'trial', 'trialing') AND converted_at IS NOT NULL;

CREATE INDEX profiles_first14_trial_started_idx
ON public.profiles (trial_started_at, user_id)
WHERE status IN ('active', 'trial', 'trialing') AND trial_started_at IS NOT NULL;