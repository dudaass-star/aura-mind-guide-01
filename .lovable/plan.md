## Objetivo

Adicionar títulos visuais em todas as mensagens proativas enviadas via texto livre (janela 24h aberta) e no fast-path de cliques de botão, para que o usuário sempre identifique que é "algo extra da Aura" — nunca uma mensagem solta fora de contexto.

## Onde aplicar

### 1. `supabase/functions/_shared/whatsapp-official.ts`

Adicionar mapa `PROACTIVE_TITLES` por `TemplateCategory` e prefixar o texto livre dentro de `sendProactiveMessage` quando `windowOpen === true`.

```ts
const PROACTIVE_TITLES: Record<TemplateCategory, string> = {
  checkin:          '🌱 *Check-in da Aura*',
  content:          '📖 *Jornada da semana*',
  weekly_report:    '📊 *Seu resumo semanal*',
  welcome:          '💜 *Bem-vinda à AURA*',
  reconnect:        '💜 *Estou de volta*',
  session_reminder: '🕐 *Lembrete de sessão*',
};
```

Aplicar como: `${PROACTIVE_TITLES[category]}\n\n${text}` (ou `teaserText` para `weekly_report`/`content`).

Categorias `monthly_letter` e `weekly_question` **não existem** mais no `TemplateCategory` — elas vão exclusivamente por `sendTemplateOnly` + fast-path. Portanto serão tratadas no item 2.

### 2. `supabase/functions/process-webhook-message/index.ts` (fast-path de cliques)

Quando o usuário clica num botão de Quick Reply e o conteúdo é entregue via `sendMessage`/`sendFreeText`, prefixar com título correspondente:

- `weekly_question` (botão "Ver pergunta") → `💭 *Pergunta da semana*`
- `monthly_letter` (botão "Acessar") → `💌 *Sua carta mensal*`
- `pending_insight [CONTENT]` (botão Jornadas) → `📖 *Jornada da semana*`
- `pending_insight [WEEKLY_REPORT]` (botão Resumo) → `📊 *Seu resumo semanal*`

### 3. Excluir explicitamente do prefixo

- `conversation-followup` → continuação natural, não usa `sendProactiveMessage` com categoria de conteúdo (nudge orgânico).
- `aura-agent` → respostas conversacionais normais, jamais.
- Templates aprovados via Twilio (Quick Reply) → o próprio header do template já cumpre o papel.
- `deliver-time-capsule` → já tem identidade própria ("⏳ Cápsula do tempo" no corpo); validar se duplica e ajustar.
- `send-meditation` → áudio, não texto; sem título.

## Validação template-only (decisão final)

Confirmado nas memórias e código:

- **`monthly_letter`** e **`weekly_question`**: sempre disparados via `sendTemplateOnly` (template Quick Reply). Conteúdo só vai por texto livre **após o clique**, dentro do fast-path do `process-webhook-message`. ✅ Tratado no item 2.
- **Demais categorias** (`checkin`, `content`, `weekly_report`, `welcome`, `reconnect`, `session_reminder`): funcionam tanto em texto livre (24h aberta) quanto em template (24h fechada). ✅ Tratado no item 1.
- **Nenhuma categoria proibida** de ir por texto livre quando a janela está aberta.

## Detalhes técnicos

- Helper `prefixWithTitle(category, text)` exportado de `whatsapp-official.ts` para reuso no `process-webhook-message`.
- Não alterar templates aprovados Twilio (já têm header oficial Meta).
- Não alterar `splitIntoMessages` do `aura-agent` (mensagens orgânicas seguem sem título).
- Sem mudança em DB nem em `whatsapp_templates`.

## Arquivos modificados

1. `supabase/functions/_shared/whatsapp-official.ts` — adicionar mapa `PROACTIVE_TITLES`, helper `prefixWithTitle`, aplicar no `sendProactiveMessage` (free-text path + teaser path).
2. `supabase/functions/process-webhook-message/index.ts` — aplicar `prefixWithTitle` nos 4 ramos do fast-path de clique (weekly_question, monthly_letter, content, weekly_report).

## Memória a salvar

Nova memória `mem://features/whatsapp/proactive-message-titles` documentando o mapa de títulos e o princípio "toda mensagem proativa em texto livre leva título; conversação orgânica nunca leva".
