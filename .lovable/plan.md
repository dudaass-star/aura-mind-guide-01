

## Plano: Corrigir detecção de conversão Semanal→Mensal usando Stripe diretamente

### Problema
O código atual tenta detectar "cobrados com sucesso" cruzando o telefone do Stripe com a tabela `profiles` e verificando `status IN ('active', 'canceled', 'canceling')`. Isso falha por dois motivos:
1. O telefone no Stripe pode não bater com o formato no `profiles` (prefixo 55, formatação)
2. Muitos profiles com status `active` são legacy e não vieram de plano semanal

O resultado é **0 cobrados** quando deveria haver mais.

### Solução: Verificar subscription status direto no Stripe

Em vez de cruzar com `profiles`, para cada customer com cobrança semanal >7d, verificar o **status da subscription no Stripe**:
- `active` → 1ª mensalidade cobrada com sucesso
- `trialing` → ainda no período semanal (não deveria estar aqui se >7d, mas possível)
- `past_due` → tentou cobrar e falhou
- `canceled` → cancelada (pode ter sido cobrada ou não — verificar se há invoice paga)

### Alterações

**1. Edge Function: `admin-engagement-metrics/index.ts` (linhas 511-540)**

Substituir o bloco de cross-reference com profiles por:

```
// Para cada customer >7d, listar subscriptions no Stripe
for (const custId of customersOver7d) {
  const subs = await stripe.subscriptions.list({ customer: custId, limit: 10 });
  for (const sub of subs.data) {
    if (sub.status === 'active') {
      weeklyPlansToPaidSuccess++;
      break; // contar 1x por customer
    }
  }
}
```

Isso elimina a dependência do `profiles` e do matching por telefone. O Stripe sabe diretamente se a assinatura transitou para `active` (= 1ª mensalidade paga).

**2. Frontend: sem alterações**
Os cards já existem ("Semanais +7d", "Cobrados (1ª mensalidade)", "Taxa Semanal→Mensal"). Só precisam receber os dados corretos do backend.

### Resultado esperado
- **Total Planos Semanais**: 23 (✅ já correto)
- **Semanais +7d**: 8 (verificar se correto — depende das datas)
- **Cobrados (1ª mensalidade)**: número real de subscriptions active entre os customers >7d
- **Taxa Semanal→Mensal**: cobrados / semanais+7d × 100

