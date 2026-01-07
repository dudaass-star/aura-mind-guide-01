-- Adicionar constraint UNIQUE para prevenir sessões duplicadas no mesmo horário
CREATE UNIQUE INDEX idx_sessions_user_scheduled_unique 
ON sessions (user_id, scheduled_at) 
WHERE status IN ('scheduled', 'in_progress');