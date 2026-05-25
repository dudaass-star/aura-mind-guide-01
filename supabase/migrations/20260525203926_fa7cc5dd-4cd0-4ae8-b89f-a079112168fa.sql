
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_template_name text,
  ADD COLUMN IF NOT EXISTS meta_language_code text NOT NULL DEFAULT 'pt_BR';

-- Popular meta_template_name com template_name (mesmo nome aprovado na nova WABA)
UPDATE public.whatsapp_templates
SET meta_template_name = template_name
WHERE meta_template_name IS NULL;
