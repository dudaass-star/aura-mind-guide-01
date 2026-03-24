

# Correção: Métricas de Trial & Conversão incorretas

## Problemas identificados

### 1. Funil mostra 13, mas Stripe tem 25 com cartão
A query filtra `trialsInPeriod` pela data do trial (`trial_started_at` ou `created_at`) dentro do período selecionado (30 dias). Usuários que cadastraram cartão **antes** desses 30 dias não aparecem. O funil deveria mostrar o total acumulado, não filtrado por período.

### 2. "Assinaram (cobrança efetivada)" mostra 0, mas existem 3 ativos no Stripe
`convertedProfiles` filtra por `status === 'active'` E `trialsInPeriod` (filtrado por data). Se os 3 assinantes converteram **antes** dos 30 dias, eles não entram no funil. Além disso, a conversão deveria ser detectada via Stripe (assinatura ativa com cobrança), não apenas pelo status do perfil.

### 3. `totalTrialsEver` é na verdade `totalTrialsInPeriod`
O nome da variável é enganoso — retorna trials filtrados por período, mas o frontend usa como base do funil (100%).

## Correção proposta

### Arquivo: `supabase/functions/admin-engagement-metrics/index.ts`

**Funil de conversão separado do filtro de período:**
- Criar query `allTimeTrials`: todos os perfis com `plan IS NOT NULL` (sem filtro de data) — representa todos que cadastraram cartão
- `allTimeResponded`: filtrar por `trial_conversations_count >= 1`
- `allTimeConverted`: filtrar por `status = 'active'` (cobrança efetivada = saiu do trial)
- Manter `trialsInPeriod` separado para os cards de "Trials (período)" e "Trials (30 dias)"

Retornar novos campos:
```
funnelTotal (todos com cartão, sem filtro de data)
funnelResponded (responderam 1+ msg)
funnelConverted (status active)
```

### Arquivo: `src/pages/AdminEngagement.tsx`

Atualizar o componente `FunnelStep` para usar `funnelTotal`, `funnelResponded`, `funnelConverted` em vez de `totalTrialsEver`.

## Resultado esperado
- "Cadastraram (com cartão)": ~25 (bate com Stripe)
- "Responderam (1+ mensagem)": número real de quem interagiu
- "Assinaram (cobrança efetivada)": 3 (bate com Stripe)
- Cards de período continuam filtrados por data normalmente

