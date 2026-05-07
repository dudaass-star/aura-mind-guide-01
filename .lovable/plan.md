## Objetivo

Implementar bugs 2, 3 e 4 da auditoria de títulos. Bug 1 (`conversation-followup`) fica para depois.

## Prefixos reais dos templates aprovados (fonte: tabela `whatsapp_templates`)

| Categoria | Prefix oficial Twilio |
|---|---|
| `checkin` | (vazio — gatilho conversacional) |
| `content` | (vazio — Quick Reply trigger) |
| `monthly_letter` | (vazio — Quick Reply trigger) |
| `weekly_question` | (vazio — Quick Reply trigger) |
| `reconnect` | `Estou de volta! 💜` |
| `session_reminder` | `Lembrete de sessão 🕐` |
| `weekly_report` | `Seu resumo semanal 📊` |
| `welcome` | `Bem-vinda à AURA 💜` |

## Bug 4 — Alinhar prefixos free-text 1:1 com templates

`supabase/functions/_shared/whatsapp-official.ts`:

```ts
const PROACTIVE_TITLES: Record<TemplateCategory, string> = {
  checkin:          '',
  content:          'Sua jornada chegou 📖',
  weekly_report:    'Seu resumo semanal 📊',
  welcome:          'Bem-vinda à AURA 💜',
  reconnect:        'Estou de volta! 💜',
  session_reminder: 'Lembrete de sessão 🕐',
};

const CLICK_DELIVERY_TITLES = {
  weekly_question: 'Sua pergunta da semana 💭',
  monthly_letter:  'Sua carta mensal 💌',
  content:         'Sua jornada chegou 📖',
  weekly_report:   'Seu resumo semanal 📊',
};
```

Mudanças:
- Remover negrito markdown `*...*` (Twilio entrega texto puro nos prefixes).
- `checkin` vira string vazia → `prefixWithTitle` deve no-op quando título for vazio.
- Textos batem literalmente com o `prefix` da `whatsapp_templates`.

Atualizar helper `prefixWithTitle(title, body)` para retornar `body` direto se `!title`.

## Bug 3 — `deliver-time-capsule` ganha título de check-in

`supabase/functions/deliver-time-capsule/index.ts`: trocar todas as chamadas `sendProactive(..., 'checkin', ...)` por `sendMessage(...)` direto. A cápsula tem identidade própria no corpo ("⏳ Cápsula do Tempo"), não deve receber prefixo de check-in.

## Bug 2 — `session-reminder` lembretes inconsistentes

`supabase/functions/session-reminder/index.ts`:

- **Linha 189** (lembrete 24h antes): trocar `sendFreeText(cleanPhone, message)` por `sendProactive(cleanPhone, message, 'session_reminder', session.user_id)`. Ganha prefixo + cai em template se janela fechada.
- **Linha 347** (notificação "chegou a hora"): mesma troca. Padroniza com lembrete 5min (linha 261).

Importar `sendProactive` no topo se ainda não estiver.

## Arquivos modificados

1. `supabase/functions/_shared/whatsapp-official.ts` — atualizar `PROACTIVE_TITLES`, `CLICK_DELIVERY_TITLES`, `prefixWithTitle`.
2. `supabase/functions/deliver-time-capsule/index.ts` — `sendProactive('checkin')` → `sendMessage`.
3. `supabase/functions/session-reminder/index.ts` — `sendFreeText` → `sendProactive('session_reminder')` em duas linhas.

## Memória

Atualizar `mem://features/whatsapp/proactive-message-titles` com a nova tabela 1:1 com templates Twilio (sem markdown, sem `checkin`).
