

# Correção: Métricas de Engajamento com Período

## Problemas identificados

### 1. Limite de 1000 linhas no Supabase (BUG CRÍTICO)
A query `periodMessages` (linha 73-78) busca **linhas** para extrair `user_id` únicos, mas o Supabase tem limite de 1000 rows por query. Em períodos longos (30d+), o resultado é truncado e `activeUsersInPeriod` fica errado. Isso afeta: usuários ativos, taxa de retorno, média diária/usuário, custo/usuário.

### 2. `funnelConverted = 18` mas Stripe tem 3 pagantes
O funil all-time filtra `status = 'active'`, mas esse status é setado no checkout (antes do pagamento). Inclui todos os 18 que fizeram checkout com trial Stripe, não apenas os 3 que pagaram.

### 3. `funnelTotal = 41` mas Stripe tem 25 com cartão
A query filtra `plan IS NOT NULL`, mas inclui ~72 perfis legados que tinham `plan = 'essencial'` por default sem nunca terem cadastrado cartão. A query original tentava excluir esses com `or('status.eq.trial,status.eq.active,...')` mas o funil all-time não tem esse filtro.

### 4. `trialsLast30Days` ignora o filtro de período
Sempre calcula 30 dias atrás a partir de `now()`, independente das datas selecionadas.

### 5. `totalTrialsEver` é na verdade `totalTrialsInPeriod`
Nome enganoso — retorna trials filtrados pelo período selecionado.

## Correções propostas

### Arquivo: `supabase/functions/admin-engagement-metrics/index.ts`

**1. Corrigir limite de 1000 rows** — Usar `select('user_id')` com paginação ou, melhor, usar uma RPC/query que conta direto no banco. Solução mais simples: fazer múltiplas queries paginadas para `periodMessages`, ou usar `count` + query separada com `select('user_id').limit(10000)`.

**2. Corrigir funil all-time** — Adicionar o mesmo filtro de status que `allTrialProfiles` usa:
```typescript
const { data: allTimeFunnelProfiles } = await supabase
  .from('profiles')
  .select('user_id, status, trial_conversations_count')
  .not('plan', 'is', null)
  .or('status.eq.trial,status.eq.active,status.eq.canceled,status.eq.canceling');
```
Isso exclui perfis legados sem interação real.

**3. Separar `funnelConverted` de trials em Stripe**  
Como não temos campo `stripe_subscription_status`, usar heurística: contar apenas perfis com `status = 'active'` E `trial_conversations_count > 0` (indica que passaram pelo fluxo de trial e converteram). Alternativa: excluir perfis cujo `trial_started_at` é recente (<7 dias) do count de "convertidos".

Melhor abordagem sem migração: usar a contagem real do Stripe via campo existente. Como não existe, usar `status = 'active'` E `plan_expires_at IS NULL` (assinantes pagos não têm expiração de plano, trials sim).

**4. Remover `trialsLast30Days` hardcoded** — Calcular com base no período selecionado ou manter como métrica separada claramente rotulada.

**5. Renomear `totalTrialsEver`** para refletir que é filtrado por período.

### Arquivo: `src/pages/AdminEngagement.tsx`

- Atualizar labels dos cards para refletir o que realmente mostram
- Funil: usar os novos campos corrigidos

## Resultado esperado
- Funil: ~25 cadastraram, ~13 responderam, ~3 assinaram (bate com Stripe)
- Métricas de período: números corretos mesmo em períodos longos (sem truncamento)
- Labels claros sobre o que cada métrica representa

