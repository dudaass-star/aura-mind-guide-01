-- Remove política SELECT ampla que dispara o linter de "Public Bucket Allows Listing".
-- O bucket continua público (URLs diretas via CDN funcionam normalmente),
-- mas a enumeração via API REST passa a exigir privilégio.
DROP POLICY IF EXISTS "Anyone can read meditation audios from storage" ON storage.objects;