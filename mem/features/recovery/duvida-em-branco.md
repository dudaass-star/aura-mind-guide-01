---
name: recovery-agent nunca adivinha a dúvida
description: Clique "Ficou uma dúvida" (e qualquer declaração de dúvida sem conteúdo) exige UMA pergunta curta; vitrine, PIX, valores, link e taster ficam de fora
type: feature
---
Origem (03/09/2026): lead clicou no quick reply "Ficou uma dúvida" e o agente adivinhou o assunto — despejou explicação de PIX Automático, valores 6,90/29,90 e link. Pareceu robô.

Regras vigentes:

- `isBlankDoubt(text)` em `supabase/functions/recovery-agent/pix-buttons.ts`: declaração de dúvida sem conteúdo, só em mensagem ≤60 chars ("ficou uma dúvida", "tenho uma dúvida", "queria tirar uma dúvida", "posso perguntar uma coisa?", "dúvida"). "tenho uma dúvida: o valor..." NÃO entra (tem conteúdo).
- Em `recovery-agent/index.ts`, `blankDoubt` liga `blankDoubtInstruction` (UMA frase perguntando qual é a dúvida, sem tag) e **desliga** `copiedPixInstruction`, `tasterInstruction` e o bloco `O QUE ... GANHA`.
- `modeInstructions` (lead e cliente) tem regra permanente: nunca responder dúvida não formulada — perguntar em uma frase e parar. Encher de informação sem pergunta é o que faz parecer robô.
- Quando ele diz qual é a dúvida na mensagem seguinte, o fluxo normal volta (destrava + UMA cena do nível A).
