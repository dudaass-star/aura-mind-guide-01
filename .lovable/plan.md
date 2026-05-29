
## Problema
O card **Funil de Checkout (período)** em `/admin/engajamento` só conta sessões de cartão (tabela `checkout_sessions`). Vendas via PIX (tabela `asaas_payments`) ficam invisíveis no funil, embora já sejam computadas separadamente para MRR.

Hoje (29/05) temos 1 venda PIX confirmada (Caiane Malta Vitalli, R$ 29,90 Essencial, `RECEIVED` 03:45) que não aparece no contador "Finalizaram Pagamento".

## Solução
Unificar cartão + PIX no mesmo funil, mantendo a mesma UI. Sem mudar nenhuma outra métrica.

### Backend — `supabase/functions/admin-engagement-metrics/index.ts`

1. O bloco PIX (linhas ~1286-1297) já calcula `asaasCheckoutCreatedInPeriod` e `asaasCheckoutConfirmedInPeriod` no período. Mover esse cálculo para fora do bloco condicional de MRR (ou garantir que sempre rode quando houver `dateFrom/dateTo`), pois hoje depende do mesmo guard de Asaas.

2. Adicionar também o equivalente **all-time** (já não existe):
   - `asaasCheckoutCreatedAllTime`: count distinto de `asaas_payments` (todos os tempos).
   - `asaasCheckoutCompletedAllTime`: idem com `status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')`.
   - Deduplicar por `customer_phone` (igual ao que já é feito para cartão via `uniquePhonesCreated`), pra evitar inflar quando o mesmo usuário gera várias cobranças PIX recorrentes.

3. Somar tudo no retorno:
   - `checkoutCreatedInPeriod = cartão + pix`
   - `checkoutCompletedInPeriod = cartão + pix`
   - `checkoutCreatedAllTime = cartão + pix`
   - `checkoutCompletedAllTime = cartão + pix`
   - Recalcular `checkoutDropoffInPeriod` e `checkoutCompletionRate` em cima dos totais já combinados.

4. Manter o cache de 5 min e a invalidação por `forceRefresh` como estão. A chave de cache não muda.

### Frontend — `src/pages/AdminEngagement.tsx`

Nenhuma mudança de componente necessária — `FunnelStep` continua igual. Os campos exibidos (`checkoutCreatedInPeriod`, `checkoutCompletedInPeriod`, `checkoutDropoffInPeriod`, `checkoutCompletionRate`, `checkoutCreatedAllTime`, `checkoutCompletedAllTime`) passam a refletir cartão + PIX automaticamente.

Opcional (se quiser deixar transparente pro admin): mudar o subtítulo do card de `"All-time: X criados, Y finalizados"` para `"All-time: X criados, Y finalizados (cartão + PIX)"`. Pequena mudança textual no JSX da linha ~1492.

### Validação
- Após deploy, abrir `/admin/engajamento` com filtro "Hoje" e clicar **Atualizar** (forceRefresh): "Finalizaram Pagamento" deve passar de 0 → ≥1 (Caiane).
- Conferir que o `Funil de Trial` (card separado, baseado em `profiles.trial_started_at`) **não foi tocado** — continua só cartão, como pretendido.

## Fora de escopo
- Não mexer no funil de trial, MRR, churn, ou em qualquer outra aba.
- Não alterar o `RecoveryInbox` nem o fluxo de Sessões/Aura.
- Não criar nova tabela nem migration — só leitura de `asaas_payments` que já existe.
