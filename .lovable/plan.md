
Objetivo: corrigir a falha que deixou a Michele sem resposta. A investigação já mostra que o problema não é mais “hipótese”; a causa raiz está identificada nos logs e no código.

Diagnóstico confirmado

- O `process-webhook-message` agora está logando corretamente e mostrou o erro real.
- Para o telefone da Michele (`5514998107426`), as 3 tentativas do worker falharam porque o `aura-agent` devolveu HTTP 500.
- Dentro do `aura-agent`, o erro real é:
  `Gemini API error: 403 — "CachedContent not found (or permission denied)"`

O que está acontecendo

1. O `aura-agent` tenta reutilizar um cache Gemini salvo em `public.gemini_cache`.
2. Existe um registro para o hash `a0f06b4e...` com:
   - `cache_name = cachedContents/5dw66zhmhf79c29ierogg6t4nst8zaelcnbn1uk7`
   - `expires_at = 2026-03-23 09:54:43+00`
3. Esse cache já expirou.
4. Mesmo assim, na criação de um novo cache ocorre conflito por chave única `(model, prompt_hash)`.
5. No tratamento de race condition, o código busca o “winner cache”, mas sem filtrar `expires_at > now()`.
6. Resultado: ele recupera justamente o cache expirado e envia `geminiBody.cachedContent = cacheName`.
7. O Gemini responde 403 porque esse `cachedContent` não existe mais ou não é mais permitido.
8. Como isso acontece nas 3 tentativas, o usuário fica sem resposta.

Evidência técnica principal

- Logs do `aura-agent`:
  - `Using explicit context cache: cachedContents/5dw66...`
  - `Gemini API error: 403`
  - `CachedContent not found (or permission denied)`
- Banco:
  - há 78 linhas expiradas em `public.gemini_cache`
- Código:
  - `getOrCreateGeminiCache()` filtra expiração no lookup inicial
  - mas no fallback de conflito busca o cache vencedor sem validar expiração

O que implementar

1. Corrigir `getOrCreateGeminiCache()` em `supabase/functions/aura-agent/index.ts`
- No bloco de conflito (`insertErr.code === '23505'`), buscar o winner apenas se `expires_at > now()`.
- Se não houver winner válido, não reutilizar o nome expirado.
- Opções seguras:
  - ou retornar o `cacheName` recém-criado se ele existir e ainda for o melhor candidato
  - ou fazer um cleanup/update do registro expirado antes de persistir
- O objetivo é impedir qualquer retorno de `cache_name` expirado.

2. Adicionar fallback resiliente no `callAI()`
- Se o `generateContent` falhar com 403 contendo `CachedContent not found`, repetir a chamada sem `cachedContent`, usando `system_instruction` inline.
- Isso evita outage total caso o cache volte a quebrar por qualquer motivo.
- Assim, o cache vira otimização, não ponto único de falha.

3. Higienizar a tabela de cache
- Criar uma migration para remover registros expirados de `public.gemini_cache`.
- Idealmente também preparar manutenção contínua, por exemplo:
  - limpeza por função agendada, ou
  - estratégia de overwrite/refresh de linha ao recriar cache para o mesmo `prompt_hash`.

4. Preservar o comportamento atual do worker
- Não mexer na arquitetura receiver/worker.
- Não mexer no lock de resposta.
- O problema está concentrado no path de cache do `aura-agent`.

Resultado esperado após a correção

- Michele e outros usuários voltam a receber resposta.
- Um cache expirado não derruba mais a AURA.
- Mesmo se o cache estiver inválido, o sistema continua respondendo via prompt inline.
- O recurso de cache continua acelerando chamadas quando estiver saudável.

Risco / impacto

- Baixo risco e alta confiança.
- Mudança localizada no `aura-agent` + uma migration simples de limpeza.
- Isso é mais importante e mais certeiro do que trocar modelo agora, porque o erro não é do modelo em si; é do identificador de cache expirado sendo reutilizado.

Arquivos a alterar

- `supabase/functions/aura-agent/index.ts`
- `supabase/migrations/...` (nova migration para limpeza/ajuste do `gemini_cache`)

Validação depois da implementação

1. Enviar novo “Oi” para um usuário afetado.
2. Confirmar nos logs que:
   - não aparece mais `CachedContent not found`
   - se houver falha de cache, ocorre fallback inline
   - o `process-webhook-message` registra envio real de resposta
3. Verificar se a Michele recebe resposta sem depender de reprocessamento manual.
