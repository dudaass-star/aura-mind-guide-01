ALTER TABLE public.user_memory_corrections
  ADD COLUMN IF NOT EXISTS correction_type text,
  ADD COLUMN IF NOT EXISTS client_message_id text;

ALTER TABLE public.user_memory_corrections
  DROP CONSTRAINT IF EXISTS user_memory_corrections_type_check;

ALTER TABLE public.user_memory_corrections
  ADD CONSTRAINT user_memory_corrections_type_check
  CHECK (
    correction_type IS NULL OR correction_type IN (
      'fato_pessoal',
      'rejeicao_hipotese',
      'contexto',
      'preferencia',
      'exclusao'
    )
  );

CREATE INDEX IF NOT EXISTS user_memory_corrections_conversation_idx
ON public.user_memory_corrections (client_message_id)
WHERE client_message_id IS NOT NULL;