UPDATE public.system_config
SET value = jsonb_build_object(
  'm1', 'HX438035e6d8892b4463e99b6abfaad832',
  'm2', 'HX8a208cd323ef2b99c92790caa0118b25',
  '_doc', 'ContentSids Twilio (subconta de recuperacao) dos templates Meta aprovados do trilho copiou-o-codigo-PIX. m1 = 15 min (copy_of_recuperacao_pix_copiaecola_15min), m2 = 2h (copy_of_recuperacao_pix_copiaecola_2hs). Quick reply, pt_BR, aprovados em 31/08/2026.'
)
WHERE key = 'wa_copiou_templates';

INSERT INTO public.whatsapp_templates
  (category, twilio_content_sid, template_name, prefix, meta_category, is_active, language_code, meta_template_name, meta_language_code, meta_variable_count, meta_variable_names)
VALUES
  ('recuperacao_pix_copiado_15min', 'HX438035e6d8892b4463e99b6abfaad832', 'copy_of_recuperacao_pix_copiaecola_15min', '', 'marketing', true, 'pt_BR', 'copy_of_recuperacao_pix_copiaecola_15min', 'pt_BR', 1, ARRAY['nome']),
  ('recuperacao_pix_copiado_2h', 'HX8a208cd323ef2b99c92790caa0118b25', 'copy_of_recuperacao_pix_copiaecola_2hs', '', 'marketing', true, 'pt_BR', 'copy_of_recuperacao_pix_copiaecola_2hs', 'pt_BR', 1, ARRAY['nome'])
ON CONFLICT (category) DO UPDATE
SET twilio_content_sid = EXCLUDED.twilio_content_sid,
    template_name = EXCLUDED.template_name,
    meta_template_name = EXCLUDED.meta_template_name,
    is_active = true;