CREATE INDEX IF NOT EXISTS thematic_snapshots_user_period_end_idx ON public.thematic_snapshots (user_id, period_end DESC);
CREATE INDEX IF NOT EXISTS user_journey_history_user_completed_idx ON public.user_journey_history (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS user_meditation_history_user_sent_idx ON public.user_meditation_history (user_id, sent_at DESC);