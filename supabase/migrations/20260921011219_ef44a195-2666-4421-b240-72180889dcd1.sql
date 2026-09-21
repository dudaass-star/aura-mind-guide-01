ALTER TABLE public.aura_response_state
  ADD COLUMN IF NOT EXISTS processed_user_message_id text;