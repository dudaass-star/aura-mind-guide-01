
ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_15min_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_recovery_last_error text;

INSERT INTO public.whatsapp_templates (category, twilio_content_sid, template_name, prefix, meta_category, is_active, language_code)
VALUES
  ('checkout_recovery_wa_15min', 'HX7ae71f9002839ec0ecdc58f6aa067a8a', 'checkout_recovery_wa_15min', '', 'MARKETING', true, 'pt_BR'),
  ('checkout_recovery_wa_24h', 'HXb34b27fda2f45a0c10fc19960bac61c1', 'checkout_recovery_wa_24h', '', 'MARKETING', true, 'pt_BR')
ON CONFLICT DO NOTHING;
