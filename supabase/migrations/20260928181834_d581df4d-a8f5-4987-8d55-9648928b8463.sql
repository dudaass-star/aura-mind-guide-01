DO $$
DECLARE
  _user_id uuid := 'abba7975-bef4-4dfe-8ef1-f87992604e1e';
  _scheduled_at timestamptz := date_trunc('hour', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' + (ceil(extract(minute from now() AT TIME ZONE 'America/Sao_Paulo') / 15.0) * interval '15 minutes');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND status = 'demo' AND current_session_id IS NULL) THEN
    RAISE EXCEPTION 'Conta de demonstração indisponível ou sessão já em andamento';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE user_id = _user_id AND status IN ('scheduled', 'in_progress')) THEN
    RAISE EXCEPTION 'Já existe sessão pendente para a personagem';
  END IF;
  INSERT INTO public.sessions (user_id, scheduled_at, status, session_type, duration_minutes, created_by, reminder_24h_sent, reminder_5m_sent, waiting_for_scheduled_time, preparation_note)
  VALUES (_user_id, _scheduled_at, 'scheduled', 'livre', 45, 'demo_session_test_20260928', true, true, false, 'Quero conversar sobre como ajudar minha irmã sem perder a escolha do meu próprio tempo. Ontem consegui dizer que ligaria mais tarde, mas senti culpa.');
END $$;