ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_variable_count integer NOT NULL DEFAULT 1;

UPDATE public.whatsapp_templates
   SET meta_variable_count = 0
 WHERE category = 'checkin';