-- Create short_links table for URL shortening
CREATE TABLE public.short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,
  url TEXT NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on short_links" 
ON public.short_links 
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Anyone can read (for redirect to work)
CREATE POLICY "Anyone can read short_links" 
ON public.short_links 
FOR SELECT
USING (true);

-- Create index for faster lookups by code
CREATE INDEX idx_short_links_code ON public.short_links(code);

-- Create index for cleanup of expired links
CREATE INDEX idx_short_links_expires_at ON public.short_links(expires_at);