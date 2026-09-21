ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_status_check
  CHECK (status IN ('pending','scheduled','sent','failed','opened','converted','suppressed'));

CREATE INDEX IF NOT EXISTS notification_deliveries_scheduled_idx
  ON public.notification_deliveries (scheduled_for)
  WHERE status = 'scheduled';