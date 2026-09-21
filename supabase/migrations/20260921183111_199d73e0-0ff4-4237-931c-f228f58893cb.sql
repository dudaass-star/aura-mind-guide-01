ALTER TABLE public.checkout_access_claims
DROP CONSTRAINT IF EXISTS checkout_access_claims_token_hash_key;

CREATE INDEX IF NOT EXISTS checkout_access_claims_token_hash_idx
ON public.checkout_access_claims (token_hash, created_at DESC);