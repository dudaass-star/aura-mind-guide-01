-- =================================================================
-- SISTEMA DE MEDITAÇÕES GUIADAS - INFRAESTRUTURA
-- =================================================================

-- Tabela de catálogo de meditações
CREATE TABLE public.meditations (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('respiracao', 'ansiedade', 'sono', 'estresse', 'foco', 'gratidao')),
  duration_seconds integer NOT NULL DEFAULT 300,
  script text NOT NULL,
  triggers text[] DEFAULT '{}',
  best_for text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Tabela de áudios gerados
CREATE TABLE public.meditation_audios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meditation_id text NOT NULL REFERENCES public.meditations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  duration_seconds integer,
  generated_at timestamp with time zone DEFAULT now()
);

-- Tabela de histórico de meditações enviadas
CREATE TABLE public.user_meditation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  meditation_id text NOT NULL REFERENCES public.meditations(id) ON DELETE CASCADE,
  sent_at timestamp with time zone DEFAULT now(),
  context text
);

-- =================================================================
-- RLS POLICIES
-- =================================================================

-- Enable RLS
ALTER TABLE public.meditations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meditation_audios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_meditation_history ENABLE ROW LEVEL SECURITY;

-- Meditations: público para leitura, service_role para escrita
CREATE POLICY "Anyone can read active meditations" 
  ON public.meditations 
  FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Service role full access on meditations" 
  ON public.meditations 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Meditation audios: público para leitura, service_role para escrita
CREATE POLICY "Anyone can read meditation audios" 
  ON public.meditation_audios 
  FOR SELECT 
  USING (true);

CREATE POLICY "Service role full access on meditation_audios" 
  ON public.meditation_audios 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- User meditation history: usuários veem próprio histórico, service_role tem acesso total
CREATE POLICY "Users can view own meditation history" 
  ON public.user_meditation_history 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_meditation_history" 
  ON public.user_meditation_history 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- =================================================================
-- STORAGE BUCKET
-- =================================================================

-- Criar bucket público para meditações
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meditations', 
  'meditations', 
  true,
  52428800, -- 50MB limit
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav']
);

-- Políticas de storage
CREATE POLICY "Anyone can read meditation audios from storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'meditations');

CREATE POLICY "Service role can upload meditation audios"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'meditations' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update meditation audios"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'meditations' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete meditation audios"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'meditations' AND auth.role() = 'service_role');

-- =================================================================
-- ÍNDICES
-- =================================================================

CREATE INDEX idx_meditations_category ON public.meditations(category);
CREATE INDEX idx_meditations_active ON public.meditations(is_active);
CREATE INDEX idx_meditation_audios_meditation_id ON public.meditation_audios(meditation_id);
CREATE INDEX idx_user_meditation_history_user_id ON public.user_meditation_history(user_id);
CREATE INDEX idx_user_meditation_history_sent_at ON public.user_meditation_history(sent_at DESC);