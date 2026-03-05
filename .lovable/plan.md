

## Correção do Stripe Webhook

### Alteração única
No arquivo `supabase/functions/stripe-webhook/index.ts`, trocar o método síncrono por assíncrono:

```typescript
// De:
event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

// Para:
event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
```

### Ação no banco
- Deletar o perfil da Nilda para que ela possa assinar novamente como teste limpo.

