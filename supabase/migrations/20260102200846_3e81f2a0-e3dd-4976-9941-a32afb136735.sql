-- Criar tabela plan_configs para configuração dos planos
CREATE TABLE public.plan_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id text NOT NULL UNIQUE,
  name text NOT NULL,
  sessions_per_month integer NOT NULL DEFAULT 0,
  session_duration_minutes integer NOT NULL DEFAULT 0,
  daily_message_target integer NOT NULL DEFAULT 0,
  price_monthly_cents integer NOT NULL,
  stripe_price_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Inserir configurações dos planos
INSERT INTO public.plan_configs (plan_id, name, sessions_per_month, session_duration_minutes, daily_message_target, price_monthly_cents, stripe_price_id) VALUES
('essencial', 'Essencial', 0, 0, 20, 2990, 'price_1SlEYjHMRAbm8MiTB689p4b6'),
('direcao', 'Direção', 4, 45, 0, 4990, 'price_1SlEb6HMRAbm8MiTz4H3EBDT'),
('transformacao', 'Transformação', 8, 45, 0, 7990, 'price_1SlEcKHMRAbm8MiTLWgfYHAV');

-- Permitir leitura pública (para frontend carregar configs)
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plan configs" ON public.plan_configs FOR SELECT USING (true);

-- Criar tipo para status de sessão
CREATE TYPE public.session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');

-- Criar tipo para tipo de sessão
CREATE TYPE public.session_type AS ENUM ('clareza', 'padroes', 'proposito', 'livre');

-- Criar tabela sessions para sessões especiais
CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  session_type public.session_type NOT NULL DEFAULT 'livre',
  scheduled_at timestamp with time zone NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45,
  status public.session_status NOT NULL DEFAULT 'scheduled',
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  focus_topic text,
  session_summary text,
  key_insights jsonb DEFAULT '[]'::jsonb,
  commitments jsonb DEFAULT '[]'::jsonb,
  reminder_1h_sent boolean DEFAULT false,
  reminder_15m_sent boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS para sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access on sessions" ON public.sessions FOR ALL USING (auth.role() = 'service_role');

-- Atualizar tabela profiles com novos campos
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS sessions_used_this_month integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_reset_date date,
  ADD COLUMN IF NOT EXISTS messages_today integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_date date,
  ADD COLUMN IF NOT EXISTS upgrade_suggested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS preferred_session_time text,
  ADD COLUMN IF NOT EXISTS current_session_id uuid REFERENCES public.sessions(id);

-- Atualizar valor padrão do plan para 'essencial'
ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'essencial';