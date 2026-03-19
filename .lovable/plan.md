

## Plano: Conexão direta Gemini sem fallback

Você tem razão — se o Gateway não suporta cache, não faz sentido mantê-lo como fallback para modelos Google. Se a `GEMINI_API_KEY` não estiver configurada, melhor falhar explicitamente do que rodar sem cache silenciosamente.

### Alteração — `supabase/functions/aura-agent/index.ts`

Na função `callAI` (linhas 228-281), substituir o bloco do Gateway por chamada direta ao Gemini para modelos `google/*`:

1. **Se modelo começa com `google/`**: exigir `GEMINI_API_KEY` — se ausente, lançar erro claro ("GEMINI_API_KEY não configurada")
2. **Chamar endpoint direto**: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` com `Authorization: Bearer ${GEMINI_API_KEY}`
3. **Extrair modelo**: `google/gemini-2.5-pro` → `gemini-2.5-pro`; manter parsing de `:low/:medium/:high` para `reasoning_effort`
4. **Payload**: mesmo formato OpenAI-compatible (messages, max_tokens, temperature/reasoning_effort)
5. **Modelos `openai/*`**: mantêm rota pelo Gateway (único caso restante)
6. **Remover logs de debug**: `GATEWAY_USAGE_RAW`, `GATEWAY_KEYS`, `GATEWAY_PTD` — já cumpriram papel

```text
Roteamento final:

model "anthropic/*"  → Anthropic API direta (já existe)
model "google/*"     → Gemini API direta (NOVO, sem fallback)
model "openai/*"     → Gateway (mantém)
```

### Resultado esperado
- Cache implícito do Gemini ativa automaticamente (~18k tokens estáticos cacheados)
- `token_usage_logs.cached_tokens` mostra valores reais a partir da 2ª chamada
- Erro explícito se a key não existir, em vez de rodar sem cache

