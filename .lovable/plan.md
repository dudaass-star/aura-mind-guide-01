

# Fix: Welcome message para novos usuários na API oficial

## Problema identificado

No `start-trial/index.ts`, a mensagem de boas-vindas usa `sendMessage()` (texto livre). Com a API oficial, texto livre **só funciona dentro da janela de 24h** — mas o usuário novo nunca mandou mensagem no WhatsApp, então **não existe janela aberta**. A mensagem vai falhar silenciosamente.

O mesmo vale para a segunda mensagem (sobre áudio).

## Solução

**Arquivo: `supabase/functions/start-trial/index.ts`**

1. Trocar `sendMessage()` por `sendProactive()` com categoria `'welcome_trial'` para a mensagem de boas-vindas — isso faz o sistema usar template quando a janela está fechada (caso de 100% dos novos usuários)
2. Remover a segunda mensagem de áudio (ou incorporá-la no template de welcome) — enviar duas mensagens template seguidas é caro e redundante
3. Remover a busca de `zapiConfig` (instância Z-API) que não é usada quando provider é 'official'

**Mudança principal (~5 linhas):**
```typescript
// ANTES:
const result = await sendMessage(formattedPhone, welcomeMessage);

// DEPOIS:
const result = await sendProactive(
  formattedPhone,
  welcomeMessage,
  'welcome_trial',
  userId
);
```

**Segunda mensagem de áudio:** incorporar no texto do welcome ou enviar como `sendProactive` com `'welcome'` category (verificar se o template existe e está ativo).

## Verificação necessária

Confirmar que o template `welcome_trial` existe e está ativo na tabela `whatsapp_templates`. Se não estiver, o sistema fará fallback para texto livre (que vai falhar para novos usuários).

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/start-trial/index.ts` | Trocar `sendMessage` por `sendProactive` com template category |

