---
name: Títulos visuais em mensagens proativas
description: Toda mensagem proativa em texto livre (24h aberta) e fast-path de cliques recebe prefixo de título; conversa orgânica nunca leva
type: feature
---

# Títulos em mensagens proativas

Princípio: o usuário deve identificar imediatamente que uma mensagem chegou "do extra" da Aura — nunca como mensagem solta sem contexto.

## Onde se aplica

1. `whatsapp-official.ts` → `sendProactiveMessage` quando janela 24h está aberta (texto livre). Mapa `PROACTIVE_TITLES` por `TemplateCategory`.
2. `process-webhook-message` → fast-path de cliques de Quick Reply (`weekly_question`, `monthly_letter`, `[CONTENT]`, `[WEEKLY_REPORT]`). Mapa `CLICK_DELIVERY_TITLES`.

## Onde NÃO se aplica

- Templates aprovados Twilio (têm header próprio Meta).
- `aura-agent` (conversa orgânica).
- `conversation-followup` nudges.
- Áudio (`send-meditation`).

## Títulos canônicos (alinhados 1:1 com `whatsapp_templates.prefix`)

Sem markdown — Twilio entrega texto puro nos prefixes dos templates.

| Categoria | Título free-text / clique |
|---|---|
| checkin | (vazio — gatilho conversacional, sem prefixo) |
| content | Sua jornada chegou 📖 |
| weekly_report | Seu resumo semanal 📊 |
| welcome | Bem-vinda à AURA 💜 |
| reconnect | Estou de volta! 💜 |
| session_reminder | Lembrete de sessão 🕐 |
| weekly_question (clique) | Sua pergunta da semana 💭 |
| monthly_letter (clique) | Sua carta mensal 💌 |

`deliver-time-capsule` usa `sendMessage` direto (identidade própria no corpo, sem prefixo).
`session-reminder` (24h, 5min, "chegou a hora") usa `sendProactive('session_reminder')`.

Helper `prefixWithTitle(title, body)` evita duplicar caso o body já comece com o título.
Quando `title === ''`, retorna o corpo intacto (no-op).
