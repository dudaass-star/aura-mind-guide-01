

## Plano: Templates WhatsApp apenas com nome — remover injeção de texto personalizado

### Problema

Na função `sendProactiveMessage` (whatsapp-official.ts, linhas 355-361), quando nenhum `templateVariables` é passado explicitamente, o sistema pega o **texto completo da mensagem**, faz split, e injeta como variável do template. Isso significa que textos longos e personalizados estão sendo enfiados dentro das variáveis dos templates, o que:

- Causa erro 63005 da Meta (variável muito longa/conteúdo não aprovado)
- Viola as regras de templates da Meta (variáveis devem ser curtas e previsíveis)
- Risco real de banimento da conta

### Funções afetadas (chamam `sendProactive` SEM `templateVariables`)

| Função | Categoria template |
|--------|-------------------|
| `stripe-webhook` (welcome, farewell, welcome-back) | `welcome`, `checkin` |
| `conversation-followup` | `followup` |
| `pattern-analysis` | `insight` |
| `send-meditation` | `content` |
| `execute-scheduled-tasks` | `checkin` |
| `test-episode-send` | `content` |
| `deliver-time-capsule` | `checkin` |
| `periodic-content` | `content` |
| `session-reminder` | `session_reminder` |
| `weekly-report` | `weekly_report` |

Funções que JÁ passam `[nome]` corretamente: `scheduled-checkin`, `instance-reconnect-notify`, `reactivation-check`.

### Correção centralizada

Modificar `sendProactiveMessage` em `whatsapp-official.ts` para que, quando fora da janela de 24h e sem `templateVariables` explícitas:

1. **Auto-resolver o nome do usuário** a partir do `userId` (já faz query ao profile para checar janela)
2. **Usar sempre `[nome]` como única variável** do template
3. **Remover completamente** o path de split/injeção de texto nas variáveis (linhas 355-371)

Isso corrige TODAS as funções de uma vez, sem precisar editar cada caller individualmente.

### Mudanças no código

#### 1. `whatsapp-official.ts` — `sendProactiveMessage`

**Antes (linhas 300-373):**
- Query profile apenas para `last_user_message_at`
- Se fora da janela e sem templateVariables: split do texto → injeta como variável

**Depois:**
- Query profile para `last_user_message_at` E `name`
- Se fora da janela e sem templateVariables: extrair primeiro nome do profile, usar `[nome]` como única variável
- Remover `splitMessageForTemplate` do fluxo de template (manter a função exportada caso algo use, mas não chamar no path de template)
- Log claro: "Using auto-resolved name as template variable"

```text
Fluxo simplificado:

sendProactiveMessage(phone, text, category, userId)
  │
  ├─ Janela 24h aberta? → sendFreeText(text)  ✅
  │
  └─ Janela fechada:
       ├─ templateVariables fornecidas? → sendTemplateMessage(vars)  ✅
       │
       └─ Sem templateVariables? → resolver nome do profile
            → sendTemplateMessage([nome])  ✅
            (NUNCA injeta o texto da mensagem)
```

#### 2. Remover `splitMessageForTemplate` do fluxo

A função pode ser mantida no arquivo mas não será mais chamada dentro de `sendProactiveMessage`. O texto da mensagem é usado APENAS no path de free text (janela aberta).

### Arquivos modificados

1. `supabase/functions/_shared/whatsapp-official.ts` — refatorar `sendProactiveMessage` para auto-resolver nome e nunca injetar texto em variáveis de template

### Deploy

Redeployar todas as funções que importam `whatsapp-official.ts` via `whatsapp-provider.ts` (~10 funções).

