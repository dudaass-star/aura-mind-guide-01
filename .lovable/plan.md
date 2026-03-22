

# Diagnóstico de Custo da API Gemini

## Descobertas

### Custo total (fev-mar): ~$33 USD (~R$180)

| Modelo | Chamadas | Custo USD | % do total |
|--------|----------|-----------|------------|
| anthropic/claude-sonnet-4-6 | 193 | $14.51 | **43%** |
| google/gemini-2.5-pro | 694 | $7.05 | 21% |
| google/gemini-3-flash-preview | 479 | $1.28 | 4% |
| anthropic/claude-haiku-4-5 | 13 | $0.27 | 1% |
| google/gemini-2.5-flash | 402 | $0.23 | 1% |

**Nota**: O custo de R$153 no Google Cloud inclui mais do que API do Gemini (inclui Supabase Edge Functions, storage, bandwidth etc).

### Problema 1: Claude Sonnet consumiu 43% do custo

No dia **17/mar**, 176 chamadas foram roteadas para `anthropic/claude-sonnet-4-6` — provavelmente o `ai_model` no `system_config` foi trocado para Claude temporariamente. A $3/M input + $15/M output, uma única sessão de testes custou $14.51.

**Impacto**: Esse único dia de Claude custou mais que toda a semana de Gemini Pro.

### Problema 2: Cache funciona, mas com escopo errado

O cache do Gemini **está funcionando** para o gemini-2.5-pro (73% hit rate esta semana). Porém:

- **423 caches únicos** criados para apenas **38 usuários** (~11 caches por usuário)
- O motivo: o código concatena `AURA_STATIC_INSTRUCTIONS` + `dynamicContext` antes de fazer o hash. Como o `dynamicContext` muda a cada mensagem (nome, plano, horário, sessão ativa), cada chamada gera um hash diferente
- Resultado: a maioria dos caches é usada 1-2x e expira. O custo de criar caches pode ser maior que a economia

### Problema 3: Flash não tem cache

Os modelos `gemini-3-flash-preview` e `gemini-2.5-flash` têm **0% cache hit** — 8.1M e 7.2M tokens de input sem nenhuma economia.

## Plano de Otimização

### 1. Separar cache: apenas AURA_STATIC_INSTRUCTIONS

No `callAI`, ao invés de cachear o `systemPrompt` inteiro (estático + dinâmico), cachear **somente** o `AURA_STATIC_INSTRUCTIONS` e enviar o `dynamicContext` como conteúdo inline separado.

Mudança em `aura-agent/index.ts`:
- Passar `AURA_STATIC_INSTRUCTIONS` e `dynamicContext` como parâmetros separados para `callAI`
- Na rota Gemini, fazer cache apenas do `AURA_STATIC_INSTRUCTIONS`
- Enviar `dynamicContext` como primeiro item do array `contents` (não como system_instruction)

**Economia estimada**: Com 1 cache por modelo (em vez de 423), o hit rate sobe de 73% para ~95%+.

### 2. Habilitar cache para Flash

Estender o caching para `gemini-3-flash-preview` e `gemini-2.5-flash`. Atualmente só o Pro é cacheado porque é o model configurado, mas as chamadas de retry/secondary tasks usam Flash sem cache.

### 3. Remover Claude do fallback

Atualmente, se alguém mudar o `system_config.ai_model` para Claude, o custo explode 20x. Adicionar validação para aceitar apenas modelos `google/*` no `system_config`, ou pelo menos um aviso de custo no admin.

## Arquivos editados
- `supabase/functions/aura-agent/index.ts` — separar cache estático vs dinâmico + cache para Flash

## Resultado esperado
- Cache hit rate sobe de ~73% para ~95%+ (1 cache reutilizado por todos os usuários)
- Flash models passam de 0% cache para ~90%+
- Economia estimada: ~40-60% nos tokens de input do Gemini

