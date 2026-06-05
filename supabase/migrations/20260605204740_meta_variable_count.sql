-- Adiciona contagem de variáveis esperadas pelo template Meta
-- para evitar erro 132000 (mismatch de params).
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_variable_count integer NOT NULL DEFAULT 1;

-- cheking_7dias foi aprovado sem variáveis no Meta
UPDATE public.whatsapp_templates
   SET meta_variable_count = 0
 WHERE category = 'checkin';
