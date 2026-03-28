

## Corrigir salvamento de cartão no checkout com trial

### Problema identificado
Todos os 6 pagamentos que falharam hoje mostram status `requires_payment_method` no Stripe. Isso significa que quando o trial de 7 dias termina e o Stripe tenta cobrar a primeira mensalidade, **não existe nenhum cartão salvo no cliente**. O Stripe não consegue cobrar porque não tem método de pagamento.

Isso NÃO é recusa de cartão por saldo insuficiente - é ausência total de cartão.

### Causa raiz
No `create-checkout/index.ts`, quando o checkout é criado com `trial_period_days: 7`, o Stripe Checkout coleta o cartão mas pode não salvá-lo como método de pagamento padrão para o customer. É necessário instruir o Stripe explicitamente.

### Correção
Atualizar `supabase/functions/create-checkout/index.ts` adicionando duas configurações ao bloco de subscription com trial:

1. **`payment_method_collection: 'always'`** - Garante que o cartão é coletado mesmo em trials
2. **`subscription_data.default_payment_method`** - Stripe Checkout automaticamente define o método como padrão quando configurado corretamente

Especificamente, adicionar ao `sessionConfig` (antes do bloco `if/else`):
```typescript
sessionConfig.payment_method_collection = 'always';
```

E no bloco de card/subscription, adicionar `payment_method_options`:
```typescript
sessionConfig.payment_method_options = {
  card: {
    setup_future_usage: 'off_session',
  },
};
```

### Sobre os clientes atuais
Os 9 clientes com assinatura `past_due` precisarão atualizar o cartão manualmente via Billing Portal. O processo de dunning pode enviar o link para eles.

### Impacto
- Novos checkouts com trial passarão a salvar o cartão corretamente
- Cobranças pós-trial serão processadas automaticamente
- Sem impacto em checkouts sem trial (já funcionam)

