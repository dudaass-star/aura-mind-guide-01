-- messages: 3.9M seq scans (histórico por usuário, ordenado por data)
CREATE INDEX IF NOT EXISTS idx_messages_user_created_at ON public.messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at DESC);

-- token_usage_logs: 1.8M seq scans (métricas de custo por período/função/usuário)
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON public.token_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_created_at ON public.token_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_function_created_at ON public.token_usage_logs (function_name, created_at DESC);

-- stripe_webhook_events: métricas por tipo/período
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at ON public.stripe_webhook_events (processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_processed ON public.stripe_webhook_events (event_type, processed_at DESC);

-- commitments: follow-ups varrem por usuário/status/vencimento
CREATE INDEX IF NOT EXISTS idx_commitments_user_created_at ON public.commitments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commitments_status_due_date ON public.commitments (commitment_status, due_date);
CREATE INDEX IF NOT EXISTS idx_commitments_session_id ON public.commitments (session_id);

-- checkout_recovery_attempts: guard de recuperação busca por sessão/telefone
CREATE INDEX IF NOT EXISTS idx_cra_checkout_session_id ON public.checkout_recovery_attempts (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_cra_phone_created_at ON public.checkout_recovery_attempts (phone_normalized, created_at DESC);

-- cancellation_feedback: consultas por telefone/usuário/período
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_phone ON public.cancellation_feedback (phone);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_user_id ON public.cancellation_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_created_at ON public.cancellation_feedback (created_at DESC);