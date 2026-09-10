---
name: Toque de Cuidado (check-in humano)
description: Estilo obrigatório de lembretes e follow-ups — pergunta genuína primeiro, oferta só sob pedido
type: preference
---
Todo lembrete/follow-up proativo (Taster R$ 6,90, código não pago, retomadas) usa o **Toque de Cuidado**: mensagem curta, primeira pessoa, que abre com uma pergunta genuína sobre a pessoa.

Regras:
1. Abre perguntando ("Deu certo aí?", "Conseguiu experimentar?"), nunca reapresentando preço, condições ou benefícios.
2. Uma pergunta só, curta. Sem parágrafo de venda, sem lista de condições.
3. Link/valor volta apenas se a pessoa responder que travou ou pedir de novo — quem reenvia é o recovery-agent na conversa.

**Why:** mensagens que repetem "R$ 6,90, PIX comum, sem autorizar nada automático" soam robóticas e afastam.

**How to apply:** `execute-scheduled-tasks` case `taster_code_reminder` já segue esse padrão; qualquer novo toque proativo deve seguir também.
