ALTER TABLE public.user_insights
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS declared_category text;

UPDATE public.user_insights
SET source_kind = 'user_declared',
    declared_category = CASE trim(replace(key, 'Declarado ·', ''))
      WHEN 'Objetivo' THEN 'objetivo'
      WHEN 'Medo' THEN 'medo'
      WHEN 'Desafio' THEN 'desafio'
      WHEN 'Valor' THEN 'valor'
      WHEN 'Aspiração' THEN 'aspiracao'
      WHEN 'Sobre mim' THEN 'sobre_mim'
      ELSE declared_category
    END
WHERE category = 'contexto'
  AND key ILIKE 'Declarado · %'
  AND source_kind IS NULL;

ALTER TABLE public.user_insights
  DROP CONSTRAINT IF EXISTS user_insights_source_kind_check,
  ADD CONSTRAINT user_insights_source_kind_check
    CHECK (source_kind IS NULL OR source_kind IN ('user_declared', 'aura_inference')),
  DROP CONSTRAINT IF EXISTS user_insights_declared_category_check,
  ADD CONSTRAINT user_insights_declared_category_check
    CHECK (declared_category IS NULL OR declared_category IN ('objetivo', 'medo', 'desafio', 'valor', 'aspiracao', 'sobre_mim'));

CREATE INDEX IF NOT EXISTS idx_user_insights_declared
  ON public.user_insights (user_id, created_at DESC)
  WHERE source_kind = 'user_declared';