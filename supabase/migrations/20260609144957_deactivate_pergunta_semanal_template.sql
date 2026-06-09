-- Desativa template pergunta_semanal nas UIs admin (parte da desativação completa do sistema)
UPDATE public.whatsapp_templates SET is_active = false WHERE template_name = 'pergunta_semanal';
