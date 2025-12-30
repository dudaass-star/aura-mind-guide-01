-- Store processed Z-API message IDs to avoid duplicate webhook retries
CREATE TABLE IF NOT EXISTS public.zapi_message_dedup (
  message_id TEXT PRIMARY KEY,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (no policies: only service role can access)
ALTER TABLE public.zapi_message_dedup ENABLE ROW LEVEL SECURITY;
