-- Fix: match_support_kb não consegue resolver o operador <=> porque a extensão vector
-- está no schema 'extensions' mas o search_path da função aponta só pra 'public'.
-- Recriamos com search_path explícito incluindo 'extensions'.
CREATE OR REPLACE FUNCTION public.match_support_kb(
  query_embedding extensions.vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  title text,
  category text,
  question text,
  answer text,
  keywords text[],
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.category,
    kb.question,
    kb.answer,
    kb.keywords,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.support_knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$function$;