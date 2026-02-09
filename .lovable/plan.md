

## Atualizar STRIPE_WEBHOOK_SECRET e testar webhook

### Passo 1: Atualizar o secret
Atualizar o valor do `STRIPE_WEBHOOK_SECRET` com o novo signing secret fornecido.

### Passo 2: Re-deploy do stripe-webhook
Fazer o redeploy da edge function `stripe-webhook` para garantir que ela pegue o novo secret.

### Passo 3: Testar
Verificar nos logs se o proximo evento do Stripe e processado com sucesso (status 200 em vez de 400).

### Passo 4: Verificar usuarios afetados
Listar perfis com status `trial` para identificar outros usuarios que podem ter pago mas nao tiveram o perfil atualizado por causa do webhook quebrado.

