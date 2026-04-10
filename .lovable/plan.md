

## Plano: Métricas de Conversão Semanal→Mensal 100% via Stripe

### Lógica confirmada pelos dados

Analisando o Stripe, o fluxo é:
- Charge de R$6,90/9,90/19,90 = pagamento do plano semanal (one-time)
- Subscription criada com trial de 7 dias → invoice #0001 com `amount_due: 0` e `billing_reason: subscription_create`
- Após 7 dias, Stripe tenta cobrar → invoice #0002 com `billing_reason: subscription_cycle` e `total > 0`

Portanto:
- **Semanais total** = customer IDs únicos com charge 690/990/1990 (já funciona = 23)
- **Semanais expirados** (tentativa de cobrança mensal) = desses 23, quantos têm pelo menos 1 invoice com `billing_reason: subscription_cycle` e `total > 0`
- **Convertidos com sucesso** = desses, quantos têm essa invoice com `status: paid`
- **Taxa de conversão** = convertidos / expirados × 100

### Alteração

**Edge Function: `admin-engagement-metrics/index.ts` (linhas 511-524)**

Substituir o bloco atual (que verifica `sub.status === 'active'`) por:

```typescript
for (const custId of customersOver7d) {
  // List invoices for this customer
  const invoices = await stripe.invoices.list({ 
    customer: custId, 
    limit: 20 
  });
  
  // Find subscription_cycle invoices with amount > 0
  // (these are the monthly billing attempts after the 7-day trial)
  const monthlyInvoices = invoices.data.filter(inv => 
    inv.billing_reason === 'subscription_cycle' && 
    (inv.total || 0) > 0
  );
  
  if (monthlyInvoices.length > 0) {
    // This customer's weekly plan expired and monthly was attempted
    weeklyPlansExpired++;
    
    // Check if any monthly invoice was actually paid
    const hasPaidMonthly = monthlyInvoices.some(inv => inv.status === 'paid');
    if (hasPaidMonthly) {
      weeklyPlansToPaidSuccess++;
    }
  }
}
```

Também:
- Adicionar variável `weeklyPlansExpired` e retorná-la no JSON
- Alterar a taxa: `weeklyPlansToPaidSuccess / weeklyPlansExpired * 100`

**Frontend: `AdminEngagement.tsx`**

- Card "Semanais +7d" → renomear para **"Semanais Expirados"** (subtitle: "Tentativa de cobrança mensal realizada")
- Card "Cobrados (1ª mensalidade)" → manter como **"Convertidos"** (subtitle: "1ª mensalidade paga com sucesso")
- Card "Taxa Semanal→Mensal" → usar `convertidos / expirados`

### Resultado esperado
- Total Planos Semanais: **23**
- Semanais Expirados (cobrança tentada): número real de invoices `subscription_cycle` encontradas
- Convertidos: invoices `subscription_cycle` com status `paid`
- Taxa: convertidos / expirados × 100

