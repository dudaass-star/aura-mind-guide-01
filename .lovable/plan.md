## Rotação da Stripe Secret Key

### O que fazer
1. Abrir o formulário seguro de atualização do secret `STRIPE_SECRET_KEY` para você colar a nova chave (`sk_live_...`).
2. Nenhuma alteração de código é necessária — todas as edge functions (`create-checkout`, `stripe-webhook`, `customer-portal`, `check-subscription`, `change-subscription-plan`, `recover-payment`, etc.) já leem `Deno.env.get("STRIPE_SECRET_KEY")` dinamicamente e passam a usar a nova chave assim que o secret é salvo.
3. Após salvar, fazer um teste rápido invocando `check-subscription` (ou abrindo o checkout no `/v2`) para confirmar que a nova chave autentica sem erro `Invalid API Key`.

### O que NÃO será mexido
- **STRIPE_PUBLISHABLE_KEY** — permanece como está (chave pública, não precisa rotacionar).
- **STRIPE_WEBHOOK_SECRET** — permanece. Só rotacionar se você também gerou um novo signing secret no dashboard (não é o caso agora).
- **Price IDs** (`STRIPE_PRICE_*`) — não são afetados pela troca da secret key.

### Depois que salvar
- Expirar a chave antiga no Stripe Dashboard ("Roll key" → escolher "now" ou 1h de margem se quiser janela de graça).
- Confirmar no Stripe que a nova chave aparece como "Última utilização = hoje" após o primeiro request da Aura.

### Observação de segurança
Não cole a chave no chat. Ela vai direto no formulário seguro do `update_secret` — nem eu nem o histórico enxergam o valor.
