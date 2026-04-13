

## Plano: Corrigir duplicação do relatório semanal com janela aberta

### Problema
Quando a janela de 24h está aberta, o `weekly-report` envia o teaser com link como texto livre (correto), mas o `pending_insight` com `[WEEKLY_REPORT]` permanece salvo. Na próxima interação do usuário, o `aura-agent` entrega o mesmo conteúdo novamente.

### Correção

#### `supabase/functions/weekly-report/index.ts` (~linha 487-491)
Após o envio bem-sucedido via `sendProactive`, verificar se o provider enviou como texto livre. Se sim, limpar o `pending_insight` imediatamente, pois o link já foi entregue.

```typescript
if (result.success) {
  // If sent as free text (window open), user already got the link — clear pending
  if (result.provider !== 'official') {
    // Not a template, so user received the full teaser with link
    await supabase.from('profiles').update({ pending_insight: null }).eq('user_id', profile.user_id);
  }
  // ... rest of success logic
}
```

**Nota**: O `result` vem de `sendProactive` que retorna `SendResult` com `provider: 'zapi' | 'official'`. Para Z-API, sempre é texto livre. Para official, precisamos checar melhor — mas como a lógica do `sendProactiveMessage` retorna `type: 'freetext'` ou `type: 'template'`, o wrapper `sendProactive` perde essa info (retorna só `provider`).

#### Alternativa mais precisa
Verificar diretamente a janela de 24h no `weekly-report` antes de salvar o `pending_insight`:
- Se janela aberta → NÃO salva `pending_insight` (o teaser vai direto como texto livre)
- Se janela fechada → salva `pending_insight` normalmente (será entregue quando clicar no botão)

### Arquivo modificado
- `supabase/functions/weekly-report/index.ts` — condicionar o save do `pending_insight` à janela de 24h

### Detalhes técnicos
- Importar `isWithin24hWindow` de `whatsapp-official.ts`
- Consultar `last_user_message_at` do profile (já disponível no select existente)
- Se `isWithin24hWindow(profile.last_user_message_at)` → pular o save do `pending_insight`

