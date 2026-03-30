
-- Add tracking columns to checkout_sessions
ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS recovery_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_last_error text,
  ADD COLUMN IF NOT EXISTS recovery_attempts_count integer NOT NULL DEFAULT 0;

-- Create checkout_recovery_attempts table
CREATE TABLE public.checkout_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  phone_raw text,
  phone_normalized text,
  status text NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.checkout_recovery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on checkout_recovery_attempts"
  ON public.checkout_recovery_attempts FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read checkout_recovery_attempts"
  ON public.checkout_recovery_attempts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
