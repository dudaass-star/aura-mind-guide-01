

## Plano: Ativar PIX via API do Stripe

Como as ferramentas do Stripe disponíveis não permitem atualizar capabilities diretamente, vamos criar uma edge function temporária que faz essa chamada à API do Stripe para ativar o `pix_payments` na sua conta.

### O que será feito

1. **Criar edge function `activate-pix-capability`** — Uma função simples que faz um POST para `https://api.stripe.com/v1/accounts/acct_1Sk3NRQU15XnZ7Vv` com o parâmetro `capabilities[pix_payments][requested]=true`, usando a `STRIPE_SECRET_KEY` que já está configurada.

2. **Executar a função** — Após deploy, invocar a função para ativar a capability.

3. **Remover a função** — Depois de confirmar que o PIX foi ativado, deletar a edge function pois ela não será mais necessária.

### Detalhes técnicos

A edge function fará uma chamada direta à API REST do Stripe:

```
POST /v1/accounts/acct_1Sk3NRQU15XnZ7Vv
Body: capabilities[pix_payments][requested]=true
Header: Authorization: Bearer STRIPE_SECRET_KEY
```

Isso solicita a ativação da capability `pix_payments` para a conta. O Stripe pode aprovar imediatamente ou colocar em revisão dependendo do status da conta.

