UPDATE public.system_config
SET value = jsonb_set(
      jsonb_set(value::jsonb, '{m3}', '"HX3e469c17798e5011a08b8ac157e6d81d"'),
      '{_doc}',
      to_jsonb('ContentSids Twilio (subconta de recuperacao) dos templates Meta aprovados do trilho copiou-o-codigo-PIX. m1 = 15 min (copy_of_recuperacao_pix_copiaecola_15min), m2 = 2h (copy_of_recuperacao_pix_copiaecola_2hs), m3 = encontro avulso R$ 6,90 (oferta_sessao_45min_unica, aprovado 31/08/2026, botoes: Quero experimentar / Tenho uma duvida). m3 so dispara com system_config.taster_enabled = true.'::text)
    )
WHERE key = 'wa_copiou_templates';

INSERT INTO public.whatsapp_templates
  (category, twilio_content_sid, template_name, prefix, meta_category, is_active, language_code, meta_template_name, meta_language_code, meta_variable_count, meta_variable_names)
VALUES
  ('checkout_recovery_wa_taster', 'HX3e469c17798e5011a08b8ac157e6d81d', 'oferta_sessao_45min_unica', '', 'MARKETING', true, 'pt_BR', 'oferta_sessao_45min_unica', 'pt_BR', 1, ARRAY['first_name'])
ON CONFLICT DO NOTHING;