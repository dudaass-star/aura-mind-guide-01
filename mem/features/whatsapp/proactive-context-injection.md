---
name: Injeção de contexto proativo no aura-agent
description: Pergunta da Semana recente vira âncora explícita no prompt para a Aura não confundir reply com continuação de sessão
type: feature
---

## Problema resolvido

Quando a usuária recebe um disparo proativo (ex: Pergunta da Semana) via template WhatsApp e responde HORAS depois com algo curto ("Como assim não entende"), o `aura-agent` antes não sabia da pergunta — ancorava na última sessão e produzia resposta desconexa. Caso real: Débora 02/06/2026.

## Como funciona

1. `process-webhook-message` (antes do `callAuraAgent`) faz lookup em `weekly_questions` por `delivered_at >= now() - 3h` para o user atual.
2. Se houver registro, monta `proactiveContext = { kind: 'pergunta_semanal', question, minutesAgo }` e passa no body do agent.
3. `aura-agent` (linha ~4234) prefixa a mensagem do usuário com bloco `[CONTEXTO IMPORTANTE: há ~Xmin você enviou…]` instruindo o LLM a tratar a mensagem como reação à pergunta, NÃO como continuação de sessão.
4. Try/catch fire-and-forget — query nunca derruba a resposta principal.

## Onde mexer

- Janela de 3h pode ser ajustada se virmos muitos falsos positivos/negativos.
- Para estender a `monthly_letters` e `pending_insights`: replicar lookup e adicionar mais `kind` no bloco do agent.

## Prompt de geração da Pergunta da Semana

`send-weekly-question/index.ts` system prompt foi reforçado para:
- linguagem concreta, sem metáfora abstrata
- não pressupor estados internos não confirmados
- ancorar em fato observável dos temas/insights recentes
- pergunta lida sozinha precisa fazer sentido (chega isolada via WhatsApp)
