CREATE OR REPLACE FUNCTION public.record_retention_offer_event(
  _offer_id uuid,
  _event_type text,
  _source text,
  _provider_reference text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _timestamp_column text;
  _current_status text;
  _current_rank integer;
  _incoming_rank integer;
BEGIN
  IF _event_type NOT IN ('created','sent','delivered','opened','accepted','payment_pending','paid','applied','failed','expired','declined','reconciled') THEN
    RAISE EXCEPTION 'Evento de retenção inválido';
  END IF;

  INSERT INTO public.retention_offer_events (offer_id, event_type, source, provider_reference, metadata)
  VALUES (_offer_id, _event_type, _source, _provider_reference, COALESCE(_metadata, '{}'::jsonb));

  IF _event_type = 'reconciled' THEN
    RETURN;
  END IF;

  SELECT status INTO _current_status
  FROM public.retention_offers
  WHERE id = _offer_id
  FOR UPDATE;

  _current_rank := CASE _current_status
    WHEN 'created' THEN 0
    WHEN 'sent' THEN 10
    WHEN 'failed' THEN 15
    WHEN 'delivered' THEN 20
    WHEN 'opened' THEN 30
    WHEN 'accepted' THEN 40
    WHEN 'payment_pending' THEN 50
    WHEN 'expired' THEN 60
    WHEN 'declined' THEN 60
    WHEN 'paid' THEN 70
    WHEN 'applied' THEN 80
    ELSE -1
  END;

  _incoming_rank := CASE _event_type
    WHEN 'created' THEN 0
    WHEN 'sent' THEN 10
    WHEN 'failed' THEN 15
    WHEN 'delivered' THEN 20
    WHEN 'opened' THEN 30
    WHEN 'accepted' THEN 40
    WHEN 'payment_pending' THEN 50
    WHEN 'expired' THEN 60
    WHEN 'declined' THEN 60
    WHEN 'paid' THEN 70
    WHEN 'applied' THEN 80
    ELSE -1
  END;

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

  IF _timestamp_column IS NOT NULL THEN
    EXECUTE format('UPDATE public.retention_offers SET %I = COALESCE(%I, now()) WHERE id = $1', _timestamp_column, _timestamp_column)
    USING _offer_id;
  END IF;

  IF _incoming_rank >= _current_rank THEN
    UPDATE public.retention_offers SET status = _event_type WHERE id = _offer_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_retention_offer_event(uuid,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_retention_offer_event(uuid,text,text,text,jsonb) TO service_role;