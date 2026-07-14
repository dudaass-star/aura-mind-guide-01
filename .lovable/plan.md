# Higiene de Interpretação — versão enxuta final

## Contexto

- 12 semanas de dados mostram correções/user oscilando entre 3 e 13, sem tendência clara e sem instrumentação.
- Fixes anteriores (Fase 1/2A) já cobriram "puxar passado sem pedir licença" em aberturas.
- O prompt do `aura-agent` já tem 9 camadas de guidance condicional — adicionar uma 10ª aumenta risco de contradição e diluição. Melhor estender o que já existe.

## Escopo (só 2 mudanças, nenhum bloco novo no prompt)

### Parte 1 — KPI "Correções por usuário por semana" (fazer primeiro)

Objetivo: baseline honesto antes de mexer em qualquer regra. Sem métrica, não dá pra saber se a mudança da Parte 2 funcionou.

- **`supabase/functions/admin-engagement-metrics-snapshot/index.ts`**: adicionar cálculo no payload existente:
  - `corrections_total_week` = `count(*) FROM user_memory_corrections WHERE created_at ≥ start_of_week`.
  - `corrections_users_week` = usuários distintos com correção na janela.
  - `corrections_per_user_week` = razão (0 se sem correções).
- **`src/pages/AdminEngagement.tsx`**: card novo "Correções / usuário / semana" com número da semana atual + sparkline das últimas 8 semanas. Sparkline vem de query direta em `user_memory_corrections` agrupada por `date_trunc('week', created_at)` — não depende de histórico do snapshot.
- Sem migration. Payload do snapshot é jsonb.

### Parte 2 — Estender o FREIO DE PRESENÇA existente (uma condição a mais)

Objetivo: manter Aura em modo exploratório enquanto o material do usuário ainda estiver raso, sem criar camada nova de instruções conflitantes.

- **`supabase/functions/aura-agent/index.ts`, linha ~1310** — o freio hoje dispara em `recentUserCount < 4 && !densitySaturated`. Passa a disparar também quando `information_density === 'low'`, independente da contagem de pares:
  - Novo gatilho: `(recentUserCount < 4 && !densitySaturated) || (information_density === 'low' && !userReflectionMode && !directionRequestDetected)`.
  - Ajustar o texto do bloco `⚠️ FREIO DE PRESENÇA` pra citar o motivo real: "material ainda raso (falta contexto concreto, emoção nomeada ou crença/origem)" em vez de "primeiras trocas".
- **Escape hatches já existentes que continuam valendo:**
  - `densitySaturated === true` → libera (comportamento atual).
  - `user_reflection_mode === true` → não dispara o freio (usuário refletindo sozinho já está entregando material denso).
  - Direction Request Detector (linha 1289) → tem precedência, retorna antes.
- Nada de bloco novo. Nada de gate paralelo. É a mesma regra, gatilho um pouco mais amplo.

### Testes

- **`supabase/functions/aura-agent/phase_thresholds_test.ts`**: adicionar 2 asserts:
  - Freio dispara quando `information_density === 'low'` mesmo com `recentPairs ≥ 4`.
  - Freio NÃO dispara quando `user_reflection_mode === true`, mesmo em `low`.

## Critério de sucesso

- **Semana 0-1 (só KPI, sem mudança de comportamento):** confirmar baseline. Esperado 6-13 correções/user/semana.
- **Semana 2+ (com freio estendido):** meta = derrubar pra ≤5, estável. Se cair sem derrubar também rating/insights (checar em `AdminEngagement`), sucesso.
- KPI passa a servir como detector automático de regressão nas próximas mudanças de prompt.

## Fora de escopo (deliberado)

- Bloco novo "gate density-aware" no prompt. Foi descartado por sobreposição com o Freio de Presença.
- Regra específica pra `medium` (hipótese aberta obrigatória). Só volta se KPI não cair o suficiente.
- Dataset offline de reincidência via Flash-lite. Custo alto, benefício especulativo sem baseline.
- Mudança em "conexão longitudinal". Coberto por Fase 1/2A.

## Arquivos tocados

- `supabase/functions/admin-engagement-metrics-snapshot/index.ts`
- `src/pages/AdminEngagement.tsx`
- `supabase/functions/aura-agent/index.ts` (linhas ~1309-1321)
- `supabase/functions/aura-agent/phase_thresholds_test.ts`
- `mem/technical/ai/therapeutic-phase-evaluator-constraints.md` (atualizar com novo gatilho)
