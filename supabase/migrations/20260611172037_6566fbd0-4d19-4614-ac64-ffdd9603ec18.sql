ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_variable_names text[];

UPDATE public.whatsapp_templates
   SET meta_template_name = 'relatorio_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = ARRAY['name'],
       is_active = true
 WHERE category = 'weekly_report';

UPDATE public.whatsapp_templates
   SET meta_template_name = 'jornada_semanal',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = ARRAY['name'],
       is_active = true
 WHERE category = 'content';

UPDATE public.whatsapp_templates
   SET meta_template_name = 'sessao_inicio2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = ARRAY['name'],
       is_active = true
 WHERE category = 'session_reminder';

UPDATE public.whatsapp_templates
   SET meta_template_name = 'welcome2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 1,
       meta_variable_names = ARRAY['name'],
       is_active = true
 WHERE category = 'welcome';

UPDATE public.whatsapp_templates
   SET meta_template_name = 'carta_mensal',
       meta_language_code = 'en',
       meta_variable_count = 1,
       meta_variable_names = ARRAY['name'],
       is_active = true
 WHERE category = 'monthly_letter';

UPDATE public.whatsapp_templates
   SET is_active = false
 WHERE category = 'checkin';