Vou fazer só este ajuste, sem trocar o provedor nem mexer em templates:

1. Atualizar `supabase/functions/webhook-meta/index.ts` para validar `x-hub-signature-256` primeiro com `META_WHATSAPP_APP_SECRET`.
2. Manter fallback para `INSTAGRAM_APP_SECRET`, para não quebrar compatibilidade com a configuração anterior.
3. Adicionar logs seguros indicando qual secret validou a assinatura, sem expor o valor do secret.
4. Deployar somente a função `webhook-meta`.
5. Depois você envia nova mensagem para o número Meta, e eu verifico nos logs se saiu de `Invalid webhook signature` e chegou no processamento.

Importante: não vou mudar `whatsapp_provider` para `meta` agora, porque você ainda vai criar os templates.