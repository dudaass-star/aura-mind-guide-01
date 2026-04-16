-- Atualiza categoria 'checkin': novo template aprovado cheking_7dias
UPDATE public.whatsapp_templates
SET twilio_content_sid = 'HX4e299f6168e7d4ac4159c14ed470fca6',
    template_name = 'cheking_7dias',
    is_active = true,
    prefix = ''
WHERE category = 'checkin';

-- Atualiza categoria 'content': novo template aprovado jornada_disponivel (Quick Reply)
UPDATE public.whatsapp_templates
SET twilio_content_sid = 'HX54e6d3098d40e95d14252af533db8725',
    template_name = 'jornada_disponivel',
    is_active = true,
    prefix = ''
WHERE category = 'content';