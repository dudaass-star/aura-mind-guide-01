-- Tabela: content_journeys (estruturas fixas das jornadas)
CREATE TABLE content_journeys (
  id text PRIMARY KEY,
  topic text NOT NULL,
  title text NOT NULL,
  description text,
  total_episodes integer NOT NULL DEFAULT 8,
  next_journey_id text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE content_journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read journeys" ON content_journeys FOR SELECT USING (true);
CREATE POLICY "Service role full access on journeys" ON content_journeys FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE content_journeys IS 'Jornadas de conteudo serializado por tema';

-- Tabela: journey_episodes (episodios de cada jornada)
CREATE TABLE journey_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id text REFERENCES content_journeys(id) ON DELETE CASCADE,
  episode_number integer NOT NULL,
  title text NOT NULL,
  content_prompt text NOT NULL,
  hook_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(journey_id, episode_number)
);

ALTER TABLE journey_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read episodes" ON journey_episodes FOR SELECT USING (true);
CREATE POLICY "Service role full access on episodes" ON journey_episodes FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE journey_episodes IS 'Episodios individuais de cada jornada';
COMMENT ON COLUMN journey_episodes.content_prompt IS 'Prompt para IA gerar o conteudo personalizado';
COMMENT ON COLUMN journey_episodes.hook_text IS 'Gancho fixo para o proximo episodio';

-- Novos campos em profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS primary_topic text,
ADD COLUMN IF NOT EXISTS current_journey_id text REFERENCES content_journeys(id),
ADD COLUMN IF NOT EXISTS current_episode integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_content_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS journeys_completed integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_journey_eligible 
ON profiles(status, current_journey_id) 
WHERE status IN ('active', 'trial') AND current_journey_id IS NOT NULL;

COMMENT ON COLUMN profiles.primary_topic IS 'Tema principal extraido do onboarding';
COMMENT ON COLUMN profiles.current_journey_id IS 'Jornada atual do usuario';
COMMENT ON COLUMN profiles.current_episode IS 'Episodio atual na jornada';
COMMENT ON COLUMN profiles.last_content_sent_at IS 'Data/hora do ultimo conteudo periodico enviado';
COMMENT ON COLUMN profiles.journeys_completed IS 'Contador de jornadas completadas';