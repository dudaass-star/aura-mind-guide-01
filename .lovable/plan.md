
# Otimização de Cache do Gemini — Implementado ✅

## Mudanças

### 1. Cache separado: estático vs dinâmico (`aura-agent/index.ts`)
- `callAI` agora aceita `cacheableSystemPrompt` opcional
- Apenas `AURA_STATIC_INSTRUCTIONS` é cacheado (hash estável = 1 cache por modelo)
- `dynamicContext` vai como conteúdo inline no array `contents`
- Resultado: cache hit rate deve subir de ~73% para ~95%+

### 2. Guardrail de custo no admin (`AdminSettings.tsx`)
- Modelos Anthropic e OpenAI agora mostram ⚠️ no label
- Alerta vermelho aparece ao selecionar modelo caro
- Referência ao incidente do dia 17/mar ($14.51 em 1 dia)

### 3. Limpeza de caches antigos (migration)
- 425 caches antigos removidos (tinham hash dinâmico, inúteis)
