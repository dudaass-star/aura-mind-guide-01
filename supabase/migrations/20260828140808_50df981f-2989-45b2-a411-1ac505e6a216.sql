ALTER TABLE public.cancellation_feedback DROP CONSTRAINT IF EXISTS cancellation_feedback_action_taken_check;
ALTER TABLE public.cancellation_feedback ADD CONSTRAINT cancellation_feedback_action_taken_check CHECK (action_taken = ANY (ARRAY[
  'paused'::text,
  'canceled'::text,
  'cancel'::text,
  'canceled_immediate_unpaid'::text,
  'retained'::text,
  'discount_30'::text,
  'downgrade_lite'::text,
  'downgrade_base'::text
]));