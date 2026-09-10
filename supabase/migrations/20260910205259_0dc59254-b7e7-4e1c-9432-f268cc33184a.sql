ALTER FUNCTION public.claim_pending_tasks(integer) OWNER TO postgres;
ALTER FUNCTION public.delete_email(text, bigint) OWNER TO postgres;
ALTER FUNCTION public.enqueue_email(text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_email_batch(text, integer, integer) OWNER TO postgres;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_tasks(integer), public.delete_email(text, bigint), public.enqueue_email(text, jsonb), public.read_email_batch(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_tasks(integer), public.delete_email(text, bigint), public.enqueue_email(text, jsonb), public.read_email_batch(text, integer, integer) TO service_role;