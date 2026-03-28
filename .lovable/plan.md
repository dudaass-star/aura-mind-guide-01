

## Retentar cobrança das invoices abertas

### Situação atual
6 invoices com status `open` no Stripe, totalizando ~R$ 299,30:
- `in_1TFt9A` — R$ 79,90 (cus_UBjE0k)
- `in_1TFsye` — R$ 29,90 (cus_UBiy)
- `in_1TFqgj` — R$ 29,90 (cus_UBgZ)
- `in_1TFqbs` — R$ 29,90 (cus_UBgZ) — mesmo cliente, invoice duplicada
- `in_1TFqEi` — R$ 49,90 (cus_UBgF)
- `in_1TFqBG` — R$ 79,90 (cus_UBgB)
- `in_1TFYWW` — R$ 49,90 (cus_UBNp)

### Ação
Rodar novamente a função `attach-checkout-payment-methods` com `dry_run=false` e `include_past_due=true`. Ela vai:
1. Verificar que os cartões já estão anexados (etapa anterior já resolveu isso)
2. Para cada subscription `past_due`, buscar a invoice aberta e chamar `stripe.invoices.pay()` com o payment method

### Expectativa realista
Na execução anterior, os cartões foram anexados com sucesso, mas as retentativas de cobrança falharam por **recusa do emissor** (saldo insuficiente, cartão bloqueado, etc.). É possível que o resultado seja o mesmo. Se falhar novamente, a alternativa é enviar mensagem de dunning via WhatsApp com link do Billing Portal para o cliente atualizar o cartão.

### Implementação
- Chamar a edge function existente `attach-checkout-payment-methods` via curl com `{ "dry_run": false, "include_past_due": true }`
- Analisar os resultados e reportar quais cobraram e quais falharam

