
CREATE OR REPLACE FUNCTION public.get_admin_metrics_snapshot_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'admin_metrics_snapshot_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_admin_metrics_snapshot_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_metrics_snapshot_secret() TO service_role;
