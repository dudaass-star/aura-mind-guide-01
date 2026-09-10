---
name: Pedido de sessão avulsa reconhecido no backend
description: recovery-agent detecta "pix normal / só 6,90 / pagar só hoje / testar antes" como pedido do encontro avulso e gera o código sem depender do LLM
type: feature
---

Caso Maria Bezerra (10/09/2026): lead disse "Pix normal pode", "Quero pagar só R$ 6,90", "Quero pagar só a de hoje" e recebeu 4 respostas explicando PIX Automático e "1ª semana do plano". Era elegível ao taster; `offerTaster` ficou `false` nas 4.

Regras:
- `pix-buttons.ts`: `RE_SINGLE_NO_MANDATE` + `wantsSingleSessionNow()`; `classifyTasterIntent` devolve `single_request` (source `porta_c`), que gera o código NA HORA, sem exigir `tasterOfferAlreadySent`.
- Gatilho avaliado na mensagem atual E em todos os inbounds não respondidos.
- `tasterInstruction` tem variante OBRIGATÓRIA quando o gatilho existe: proibido falar de PIX Automático, autorização, 8º dia, R$ 29,90, semana, plano, 7 dias.
- `offerTaster` é forçado pelo backend quando gatilho + elegível, mesmo sem o marcador `[OFERECER_TASTER]`.
- `RE_TASTER_CONFUSION`: mensagem com 6,90 + semana/plano/assinatura/7 dias/mensalidade/autoriza é regerada uma vez antes de sair.
- KB tem 2 entradas (prioridade 100) separando o encontro avulso da 1ª semana do plano — antes todas as 7 menções a 6,90 descreviam a semana com autorização.
- `preview: true` ignora a cota de respostas automáticas (validação sem enviar).
