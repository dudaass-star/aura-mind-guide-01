-- 1) Mover extensão vector para schema dedicado
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

ALTER EXTENSION vector SET SCHEMA extensions;

-- Garante que extensions esteja no search_path padrão dos roles para uso transparente
ALTER ROLE authenticator SET search_path = public, extensions;
ALTER ROLE anon SET search_path = public, extensions;
ALTER ROLE authenticated SET search_path = public, extensions;
ALTER ROLE service_role SET search_path = public, extensions;
ALTER ROLE postgres SET search_path = public, extensions;

-- 2) Restringir listagem ampla do bucket público 'meditations'
-- Arquivos continuam acessíveis por URL pública (CDN); apenas a enumeração via API é fechada
DROP POLICY IF EXISTS "Public read meditations" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read meditations" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read on meditations" ON storage.objects;
DROP POLICY IF EXISTS "Public can view meditations" ON storage.objects;

CREATE POLICY "Service role manages meditations bucket"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'meditations' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'meditations' AND auth.role() = 'service_role');