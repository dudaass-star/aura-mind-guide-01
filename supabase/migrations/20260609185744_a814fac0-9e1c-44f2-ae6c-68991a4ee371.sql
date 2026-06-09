
CREATE TABLE IF NOT EXISTS public.blog_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cta_copy text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_clusters TO anon, authenticated;
GRANT ALL ON public.blog_clusters TO service_role;
ALTER TABLE public.blog_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clusters publicly readable" ON public.blog_clusters
  FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid REFERENCES public.blog_clusters(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL,
  content_md text NOT NULL,
  cover_url text,
  cover_alt text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  meta_title text NOT NULL,
  meta_description text NOT NULL,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  json_ld jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  word_count int NOT NULL DEFAULT 0,
  reading_minutes int NOT NULL DEFAULT 5,
  is_pillar boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_posts_status_published_at_idx
  ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_cluster_idx
  ON public.blog_posts (cluster_id, published_at DESC);
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published posts publicly readable" ON public.blog_posts
  FOR SELECT USING (status = 'published');
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.editorial_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.blog_clusters(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  keyword text NOT NULL,
  proposed_title text NOT NULL,
  briefing text NOT NULL,
  is_pillar boolean NOT NULL DEFAULT false,
  requires_manual_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued',
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_calendar_status_scheduled_idx
  ON public.editorial_calendar (status, scheduled_for);
GRANT SELECT ON public.editorial_calendar TO authenticated;
GRANT ALL ON public.editorial_calendar TO service_role;
ALTER TABLE public.editorial_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage editorial calendar" ON public.editorial_calendar
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER editorial_calendar_updated_at
  BEFORE UPDATE ON public.editorial_calendar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
