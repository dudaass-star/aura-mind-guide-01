ALTER TABLE public.inter_webhook_events
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT inter_webhook_events_processing_status_check
    CHECK (processing_status IN ('processing', 'processed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_inter_webhook_events_processing
  ON public.inter_webhook_events (processing_status, updated_at);

DROP TRIGGER IF EXISTS update_inter_webhook_events_updated_at ON public.inter_webhook_events;
CREATE TRIGGER update_inter_webhook_events_updated_at
  BEFORE UPDATE ON public.inter_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inter_pix_recurrences
  ADD COLUMN IF NOT EXISTS request_key TEXT,
  ADD COLUMN IF NOT EXISTS creation_status TEXT NOT NULL DEFAULT 'completed',
  ADD CONSTRAINT inter_pix_recurrences_creation_status_check
    CHECK (creation_status IN ('creating', 'completed', 'failed', 'compensating', 'compensated'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_inter_rec_request_key
  ON public.inter_pix_recurrences (request_key)
  WHERE request_key IS NOT NULL;

ALTER TABLE public.inter_pix_charges
  ADD COLUMN IF NOT EXISTS access_activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inter_charges_reconciliation
  ON public.inter_pix_charges (paid_at, access_activated_at, created_at);