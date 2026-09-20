CREATE TABLE public.retention_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id uuid NOT NULL,
  profile_id uuid,
  phone_normalized text,
  email_normalized text,
  origin text NOT NULL,
  reason text,
  tier text NOT NULL,
  gateway text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  plan text,
  billing_cycle text,
  amount_cents integer,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','sent','delivered','opened','accepted','payment_pending','paid','applied','failed','expired','declined')),
  public_code_hash text NOT NULL UNIQUE,
  provider_message_id text,
  provider_checkout_id text,
  provider_subscription_id text,
  provider_payment_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  accepted_at timestamptz,
  payment_pending_at timestamptz,
  paid_at timestamptz,
  applied_at timestamptz,
  failed_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.retention_offers TO service_role;
ALTER TABLE public.retention_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages retention offers" ON public.retention_offers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.retention_offer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.retention_offers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','sent','delivered','opened','accepted','payment_pending','paid','applied','failed','expired','declined','reconciled')),
  source text NOT NULL,
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.retention_offer_events TO service_role;
ALTER TABLE public.retention_offer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages retention offer events" ON public.retention_offer_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX retention_offers_profile_created_idx ON public.retention_offers(profile_user_id, created_at DESC);
CREATE INDEX retention_offers_status_updated_idx ON public.retention_offers(status, updated_at);
CREATE INDEX retention_offers_provider_payment_idx ON public.retention_offers(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX retention_offer_events_offer_created_idx ON public.retention_offer_events(offer_id, created_at);

CREATE TRIGGER update_retention_offers_updated_at BEFORE UPDATE ON public.retention_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dunning_attempts ADD COLUMN offer_id uuid REFERENCES public.retention_offers(id) ON DELETE SET NULL;
ALTER TABLE public.retention_events ADD COLUMN offer_id uuid REFERENCES public.retention_offers(id) ON DELETE SET NULL;
ALTER TABLE public.cancellation_feedback ADD COLUMN offer_id uuid REFERENCES public.retention_offers(id) ON DELETE SET NULL;

CREATE INDEX dunning_attempts_offer_id_idx ON public.dunning_attempts(offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX retention_events_offer_id_idx ON public.retention_events(offer_id) WHERE offer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_retention_offer_event(
  _offer_id uuid,
  _event_type text,
  _source text,
  _provider_reference text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _timestamp_column text;
BEGIN
  IF _event_type NOT IN ('created','sent','delivered','opened','accepted','payment_pending','paid','applied','failed','expired','declined','reconciled') THEN
    RAISE EXCEPTION 'Evento de retenção inválido';
  END IF;

  INSERT INTO public.retention_offer_events (offer_id, event_type, source, provider_reference, metadata)
  VALUES (_offer_id, _event_type, _source, _provider_reference, COALESCE(_metadata, '{}'::jsonb));

  IF _event_type <> 'reconciled' THEN
    _timestamp_column := CASE _event_type
      WHEN 'sent' THEN 'sent_at'
      WHEN 'delivered' THEN 'delivered_at'
      WHEN 'opened' THEN 'opened_at'
      WHEN 'accepted' THEN 'accepted_at'
      WHEN 'payment_pending' THEN 'payment_pending_at'
      WHEN 'paid' THEN 'paid_at'
      WHEN 'applied' THEN 'applied_at'
      WHEN 'failed' THEN 'failed_at'
      WHEN 'declined' THEN 'declined_at'
      ELSE NULL
    END;

    IF _timestamp_column IS NULL THEN
      UPDATE public.retention_offers SET status = _event_type WHERE id = _offer_id;
    ELSE
      EXECUTE format('UPDATE public.retention_offers SET status = $1, %I = COALESCE(%I, now()) WHERE id = $2', _timestamp_column, _timestamp_column)
      USING _event_type, _offer_id;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_retention_offer_event(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_retention_offer_event(uuid,text,text,text,jsonb) TO service_role;