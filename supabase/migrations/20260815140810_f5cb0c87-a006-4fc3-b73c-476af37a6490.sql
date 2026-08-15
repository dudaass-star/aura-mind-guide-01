-- A categoria "reconnect" apontava para um template que não existe no WhatsApp
-- oficial (aura_reconnect_v2 → erro 132001), caindo sempre no fallback e
-- entregando a mensagem quebrada "Estou de volta! 💜 there".
-- Passa a usar o template aprovado cheking_7dias2 (sem variável numerada),
-- que abre a janela de 24h para a entrega do conteúdo em pending_insight.
update public.whatsapp_templates
   set meta_template_name = 'cheking_7dias2',
       meta_language_code = 'pt_BR',
       meta_variable_count = 0
 where category = 'reconnect';