# Fix: Limite de retomadas por sessão (máx. 3) — Implementado ✅

## Problema
Sessões podiam ser retomadas infinitamente — cada gap >2h resetava o relógio para +20 min.

## O que foi feito

1. **Migração SQL**: Adicionado `resumption_count integer NOT NULL DEFAULT 0` à tabela `sessions`
2. **`calculateSessionTimeContext`**: Novo parâmetro `resumptionCount`. Quando `>= 3` e gap >2h, não ativa `isResuming` — mantém overtime + instrução de encerrar
3. **Incremento automático**: Contador incrementado no banco quando `isResuming = true` (sessão normal e órfã)
4. **Todas as 6 chamadas** passam `currentSession.resumption_count ?? 0`

## Fluxo

```text
Retomada 1: gap >2h → isResuming=true, +20 min, counter=1
Retomada 2: gap >2h → isResuming=true, +20 min, counter=2  
Retomada 3: gap >2h → isResuming=true, +20 min, counter=3
Retomada 4: gap >2h → maxResumptionsReached=true, overtime, Aura propõe encerrar
```
