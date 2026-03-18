

## Plano: Custo Real com Cache de Tokens

### Problema

A tabela `token_usage_logs` registra `prompt_tokens` e `completion_tokens`, mas **nao separa tokens cacheados dos nao-cacheados**. Tokens de input cacheados custam ~75% menos. Sem essa separacao, qualquer calculo de custo sera estimativa, nao real.

### Prerequisito: Descobrir o formato do cache no Gateway

O log `TOKEN_USAGE_RAW` (linha 127 do `aura-agent`) ja esta no codigo mas ainda nao apareceu nos logs. Precisamos desse dado para saber se o Gateway retorna algo como `cached_tokens`, `prompt_tokens_details.cached_tokens`, ou nao retorna nada.

### Plano em 3 etapas

#### Etapa 1 -- Capturar dados de cache (agora)

1. **Adicionar coluna `cached_tokens`** na tabela `token_usage_logs` (integer, default 0)
2. **Atualizar `logTokenUsage`** no `aura-agent/index.ts` para extrair tokens cacheados do objeto `usage` (tentando multiplos formatos: `usage.prompt_tokens_details?.cached_tokens`, `usage.cached_tokens`, etc.) e gravar na nova coluna
3. Isso comeca a acumular dados reais imediatamente

#### Etapa 2 -- Calculo de custo real no backend

4. **Atualizar `admin-engagement-metrics/index.ts`**:
   - Query `token_usage_logs` no periodo, agrupado por modelo
   - Para cada modelo, calcular: `custo_input = (prompt_tokens - cached_tokens) * preco_input + cached_tokens * preco_input_cached`
   - `custo_output = completion_tokens * preco_output`
   - Retornar: `totalCostUSD`, `avgCostPerActiveUser`, `costBreakdownByModel`
   - Tabela de precos como constantes (atualizavel)

5. **Remover metricas obsoletas do trial**:
   - Remover: `trialValueDeliveredCount`, `trialAhaCount`, `trialCompletedCount`, `avgAhaAtCount`, `phaseDistribution`
   - Manter: `activeTrials`, `trialsStarted`, `trialRespondedCount`, `convertedCount`, `conversionRate`, `expiredTrials`

#### Etapa 3 -- Frontend

6. **Atualizar `AdminEngagement.tsx`**:
   - Novo card "Custo Total (periodo)" e "Custo Medio/Usuario Ativo" na tab Engajamento
   - Funil de trial simplificado: Cadastro (com cartao) -> Responderam (1+ msg) -> Assinaram
   - Remover secoes de fases e Aha Moment

### Tabela de precos (constantes no codigo)

| Modelo | Input/1M | Input Cache/1M | Output/1M |
|--------|----------|----------------|-----------|
| gemini-2.5-flash | $0.15 | $0.0375 | $0.60 |
| gemini-3-flash-preview | $0.15 | $0.0375 | $0.60 |
| gemini-2.5-pro | $1.25 | $0.3125 | $10.00 |
| claude-sonnet-4-6 | $3.00 | $0.30 | $15.00 |
| claude-haiku-4-5 | $0.80 | $0.08 | $4.00 |

*Precos publicados. Desconto de cache: 75% para Gemini, 90% para Claude.*

### Arquivos editados
- Migracao SQL: adicionar `cached_tokens` em `token_usage_logs`
- `supabase/functions/aura-agent/index.ts` -- extrair e gravar `cached_tokens`
- `supabase/functions/admin-engagement-metrics/index.ts` -- calculo de custo real + remover metricas obsoletas
- `src/pages/AdminEngagement.tsx` -- novos cards de custo + funil simplificado

### Nota
Enquanto `cached_tokens` ainda nao tiver dados historicos (primeiros dias), o custo sera calculado como se nao houvesse cache (worst case). Conforme os dados acumulam, o custo refletira o desconto real do cache.

