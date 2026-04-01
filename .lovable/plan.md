

# Sempre enviar episódios como link (teaser)

## Problema

Na `whatsapp-official.ts` linha 317, quando a janela de 24h está aberta, o sistema envia `text` (conteúdo completo) em vez do `teaserText` (link). O fix anterior não foi aplicado.

## Solução — 1 linha

**Arquivo: `supabase/functions/_shared/whatsapp-official.ts`** (linha 317)

Trocar:
```typescript
const result = await sendFreeText(phone, text);
```
Por:
```typescript
const messageToSend = teaserText || text;
const result = await sendFreeText(phone, messageToSend);
```

Isso garante que, quando o teaser existe (todos os episódios de jornada), o link é enviado mesmo dentro da janela de 24h. Mensagens sem teaser (check-ins, insights) continuam enviando o texto completo normalmente.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/whatsapp-official.ts` | Usar `teaserText` quando disponível no modo free text |

