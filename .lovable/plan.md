

## Plano Revisado: Context Caching Explícito do Gemini

### Análise da consideração

A observação é válida e relevante. Quando o cache expira, múltiplas invocações simultâneas do `aura-agent` (usuários diferentes enviando mensagem ao mesmo tempo) podem todas detectar "cache expirado" e criar caches duplicados na API do Gemini — pagando writes desnecessários.

A solução proposta (`UNIQUE (model, prompt_hash)` + `INSERT ... ON CONFLICT DO NOTHING`) resolve isso elegantemente:
- Primeira instância: cria o cache na API Gemini + insere na tabela
- Instâncias concorrentes: tentam inserir, conflito detectado, fazem SELECT e usam o cache já criado
- Sem locks, sem mutex distribuído

**Incorporado ao plano.**

### Implementação

#### 1. Migração SQL

```sql
CREATE TABLE public.gemini_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL,
  cache_name text NOT NULL,
  prompt_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT gemini_cache_model_hash_unique UNIQUE (model, prompt_hash)
);
ALTER TABLE public.gemini_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on gemini_cache"
  ON public.gemini_cache FOR ALL
  USING (auth.role() = 'service_role');
```

#### 2. Modificar `aura-agent/index.ts` — branch Google

Nova função `getOrCreateGeminiCache(supabase, geminiModel, systemPrompt, apiKey)`:

a) Hash do `systemPrompt` (SHA-256 hex truncado)

b) SELECT da tabela onde `model = geminiModel AND prompt_hash = hash AND expires_at > now()`

c) Se encontrou → retorna `cache_name`

d) Se não encontrou:
   - POST para `v1beta/cachedContents` com TTL 1h
   - INSERT INTO gemini_cache ... ON CONFLICT (model, prompt_hash) DO NOTHING
   - Se insert retornou 0 rows (outra instância ganhou a corrida) → SELECT novamente
   - Retorna `cache_name`

e) Na chamada `generateContent`:
   - Cache disponível: body usa `cachedContent: cacheName`, sem `system_instruction`
   - Cache indisponível (falha na API): fallback com `system_instruction` inline

#### 3. Fluxo de concorrência

```text
Instance A          Instance B          DB                  Gemini API
    │                   │                │                      │
    ├─ SELECT cache ────┤─ SELECT cache ─┤                      │
    │  (not found)      │  (not found)   │                      │
    ├─ POST create ─────┤─ POST create ──┤──────────────────────┤
    │  (returns name1)  │  (returns name2)                      │
    ├─ INSERT ... ON CONFLICT DO NOTHING                        │
    │  (success, 1 row) │                │                      │
    │                   ├─ INSERT ... ON CONFLICT DO NOTHING    │
    │                   │  (0 rows, conflict)                   │
    │                   ├─ SELECT cache ─┤                      │
    │                   │  (gets name1)  │                      │
    │                   │                │                      │
    ├─ uses name1       ├─ uses name1    │                      │
```

Custo da corrida: 1 cache extra criado na API Gemini (expira em 1h automaticamente). Aceitável dado que é evento raro (só na expiração).

#### 4. Invalidação por mudança de prompt

Se o hash do prompt mudou (deploy com prompt novo):
- SELECT não encontra match (hash diferente)
- Cria novo cache normalmente
- Cache antigo expira sozinho pelo TTL

Sem necessidade de DELETE explícito.

### O que NÃO muda
- Branch Anthropic, Gateway, webhook-zapi, logTokenUsage
- `dynamicContext` continua como mensagem em `contents` (não cacheável)
- Formato de resposta idêntico

