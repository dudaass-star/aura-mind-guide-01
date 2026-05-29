## Diagnóstico

Hoje (29/05 BRT) os dados reais são:
- Cartão: 3 sessões criadas, 1 finalizada (elaine.eclm)
- PIX: 1 RECEIVED (Caiane 03:43 UTC) + 3 PENDING

O backend já calcula `asaasCheckoutCreatedInPeriod=2` e `asaasCheckoutConfirmedInPeriod=1` (log `💠 Asaas/PIX: checkout(2→1)` em 14:18Z), e o payload inclui `checkoutCreatedTotalInPeriod = 3+2 = 5` e `checkoutCompletedTotalInPeriod = 1+1 = 2`.

Mas a UI mostra **3 criados / 1 finalizado** — exatamente o número do cartão sozinho. Significa que os campos `*TotalInPeriod` não estão chegando renderizados — ou por cache do edge (payload antigo persistido na memória do worker antes do redeploy completar) ou porque o build do front ainda não trocou para os novos campos.

Há também um bug latente: o contador PIX no período filtra por `created_at`. Se um PIX foi criado ontem e confirmado hoje, ele não conta nem como "criado hoje" nem como "finalizado hoje". O correto é usar `paid_at` para o contador de confirmados.

## Mudanças

### 1. Backend — `supabase/functions/admin-engagement-metrics/index.ts`

No bloco PIX (linhas ~1288-1299), separar criados (por `created_at`) de confirmados (por `paid_at`):

- Manter a query atual de `asaasCreatedInPeriod` (por `created_at`) só para o contador "criados".
- Adicionar uma segunda query: `asaas_payments` com `status IN ('CONFIRMED','RECEIVED')` e `paid_at` dentro de `[periodStart, periodEnd)`, ignorando E2E, para preencher `asaasCheckoutConfirmedInPeriod`.
- Deduplicar confirmados por `customer_email` (consistente com o cartão por telefone único).

### 2. Backend — invalidar cache stale

Bumpar a versão da chave de cache (ex.: prefixo `v2:` em `cacheKey`) para forçar recomputo na próxima chamada, garantindo que workers com payload antigo não sirvam respostas sem `checkoutCreatedTotalInPeriod`/`checkoutCompletedTotalInPeriod`.

### 3. Frontend — `src/pages/AdminEngagement.tsx`

Nenhuma mudança lógica. Confirmar que o `??` em `metrics.checkoutCreatedTotalInPeriod ?? metrics.checkoutCreatedInPeriod` está nos pontos certos (já está). Após o deploy do backend + refresh com "Atualizar", o card deve mostrar **5 criados / 2 finalizados** para 29/05.

## Validação

1. Após deploy, abrir `/admin/engajamento` com filtro "Hoje" e clicar **Atualizar**.
2. No log da edge function, conferir nova linha `💠 Asaas/PIX: checkout(2→1)`.
3. UI deve passar a mostrar:
   - Clicaram para Pagar: **5**
   - Finalizaram Pagamento: **2** (elaine cartão + Caiane PIX)
   - Taxa: 40%

## Fora de escopo

- Trial funnel, MRR, churn, RecoveryInbox: intocados.
- Nenhuma migration nova.
