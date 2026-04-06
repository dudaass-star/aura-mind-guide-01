

## Plano: Remover dunning via WhatsApp + Eliminar fallbacks de texto livre

### Contexto

Dois problemas de segurança da conta Meta:

1. **Dunning via WhatsApp** — O `stripe-webhook` (linhas 1134-1148) envia notificação WhatsApp via template `access_blocked` após já ter enviado o email. Deve ser removido.

2. **Fallback de texto livre fora da janela** — Em `whatsapp-official.ts` (linhas 342-346), quando um template não está ativo/aprovado, o sistema tenta enviar como texto livre fora da janela de 24h. Isso viola as regras da Meta e pode causar banimento.

### Regra de ouro (proteção contra banimento)

- **Janela aberta (24h)** → texto livre, sem template
- **Janela fechada** → template obrigatório. Se template não disponível → **falhar silenciosamente** e logar o erro. Nunca tentar texto livre.

### Correções

#### 1. Remover bloco WhatsApp do dunning no stripe-webhook

**Arquivo:** `supabase/functions/stripe-webhook/index.ts`

Deletar linhas 1134-1148 (bloco "Step 5: Send WhatsApp notification" que chama `sendProactive` com categoria `access_blocked`). O email já cobre a notificação.

#### 2. Remover fallback de texto livre em `sendProactiveMessage`

**Arquivo:** `supabase/functions/_shared/whatsapp-official.ts`

Na função `sendProactiveMessage`, linhas 342-346:

**Antes:**
```typescript
if (!templateConfig.is_active || templateConfig.twilio_content_sid === 'PENDING_APPROVAL') {
  console.warn(`⚠️ [Twilio] Template "${templateCategory}" not active, attempting free text fallback`);
  const result = await sendFreeText(phone, text);
  return { success: result.success, parts: 1, type: 'freetext', error: result.error };
}
```

**Depois:**
```typescript
if (!templateConfig.is_active || templateConfig.twilio_content_sid === 'PENDING_APPROVAL') {
  const errMsg = `Template "${templateCategory}" not active/approved. Cannot send outside 24h window without approved template. Aborting to protect Meta account quality.`;
  console.error(`🛑 [Twilio] ${errMsg}`);
  return { success: false, parts: 0, type: 'template', error: errMsg };
}
```

Também remover o envio de "Parts 2+" como texto livre (linhas 368-377), pois fora da janela o template não abre sessão — essas partes nunca seriam entregues e são uma violação potencial. Se a mensagem não cabe em um template, deve usar teaser mode.

#### 3. Redeploy

Redeployar `stripe-webhook` e `process-webhook-message` (que importa `whatsapp-official.ts`).

### Arquivos modificados

1. `supabase/functions/stripe-webhook/index.ts` — remover bloco WhatsApp dunning
2. `supabase/functions/_shared/whatsapp-official.ts` — remover fallback de texto livre, remover split de partes extras

