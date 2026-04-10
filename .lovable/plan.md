

## Plano: Corrigir contagem de "Semanais Expirados" filtrando apenas invoices realmente tentadas

### Problema identificado

O código atual conta QUALQUER invoice com `billing_reason === 'subscription_cycle' && total > 0` como "expirado". Isso inclui:
1. Invoices com status `draft` — o Stripe ainda não tentou cobrar
2. Clientes sem nenhuma subscription_cycle invoice estão sendo contados como >7d mas não como expirados (correto), porém clientes com `draft` estão inflando o número

A contagem correta de "expirados" (tentativa de cobrança mensal realizada) deve considerar apenas invoices com status `open`, `paid`, `uncollectible` ou `void` — ou seja, invoices que foram **finalizadas** e onde o Stripe **tentou** cobrar.

### Alteração

**Edge Function: `admin-engagement-metrics/index.ts` (linhas 518-521)**

Alterar o filtro de invoices para excluir `draft`:

```typescript
// ANTES:
const monthlyInvoices = invoices.data.filter(inv => 
  inv.billing_reason === 'subscription_cycle' && 
  (inv.total || 0) > 0
);

// DEPOIS:
const monthlyInvoices = invoices.data.filter(inv => 
  inv.billing_reason === 'subscription_cycle' && 
  (inv.total || 0) > 0 &&
  inv.status !== 'draft'  // draft = not yet attempted
);
```

Isso garante que apenas cobranças realmente tentadas (finalizadas pelo Stripe) sejam contadas como "expirados".

### Resultado esperado baseado nos dados verificados
- **Total Planos Semanais**: 23 (sem mudança)
- **Semanais +7d**: 9 (sem mudança — são os que pagaram o semanal há mais de 7 dias)
- **Semanais Expirados**: ~7-8 (apenas os que tiveram invoice finalizada, excluindo drafts)
- **Convertidos**: 3 (invoices com status `paid`)
- **Taxa**: 3/7 ou 3/8 ≈ 37-43%

