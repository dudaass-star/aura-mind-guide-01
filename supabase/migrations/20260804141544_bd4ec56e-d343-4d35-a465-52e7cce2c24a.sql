insert into public.whatsapp_templates (template_name, category, twilio_content_sid, meta_category, meta_variable_count, language_code, prefix, is_active)
select 'dunning_notice', 'dunning_notice', 'HXaf4af1e1f5d4cf40b6fff6b5b68df29a', 'utility', 2, 'pt_BR', '', true
where not exists (select 1 from public.whatsapp_templates where twilio_content_sid = 'HXaf4af1e1f5d4cf40b6fff6b5b68df29a');