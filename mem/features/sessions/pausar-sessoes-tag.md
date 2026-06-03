---
name: Tag PAUSAR_SESSOES para pular o mês
description: Aura DEVE emitir [PAUSAR_SESSOES data="YYYY-MM-DD"] quando usuário pedir pra pular/adiar sessões do mês — sem a tag, needs_schedule_setup continua true e ela reinsiste
type: feature
---

Handler em `aura-agent/index.ts` (~linha 7094) faz REGEX literal sobre a resposta da Aura: `[PAUSAR_SESSOES data="YYYY-MM-DD"]`. Quando match, zera `needs_schedule_setup` e grava `sessions_paused_until=<data>` no profile. Máximo 90 dias no futuro.

## Por que existe
Bug Eduardo (02/06/2026): usuário pediu "vamos deixar sem sessões esse mês, me chama em julho". Aura confirmou verbalmente ("deixo anotado pra te chamar no dia 1º de julho") mas NÃO emitiu a tag — `needs_schedule_setup` ficou true e no dia seguinte ela voltou: "como você tem 4 sessões pra usar esse mês, vamos organizar sua agenda". Usuário achou chato.

Mesmo padrão do bug histórico da Larissa Dorneles (22/04) com `[AGENDAR_SESSAO]`: confirmação verbal sem tag = promessa vazia.

## Contrato no prompt
O bloco "SE O USUÁRIO QUISER PULAR/ADIAR O MÊS" foi adicionado dentro do `if (needs_schedule_setup && ...)` em `aura-agent/index.ts` (~linha 6044). Default da data: dia 1 do próximo mês.

⚠️ **Sem frases-exemplo literais no prompt** — só o contrato — pra evitar Aura repetir bordões tipo "é cansaço real ou aquele 'deixa pra depois'?". A checagem de motivação é opcional (no máximo 1) e deve ser formulada com palavras próprias a cada vez.

## Reativação automática
- `schedule-setup-reminder` filtra `sessions_paused_until.is.null OR sessions_paused_until.lt.<today>` — usuário pausado não recebe nudge.
- `monthly-schedule-renewal` (dia 1, 10h BRT) reseta `sessions_paused_until=null` e `needs_schedule_setup=true` automaticamente — pausa de meses futuros vira fluxo normal no início do novo mês.

## Validação
Log esperado quando funciona: `⏸️ Pausing sessions until <date> for user <name>` seguido de `✅ Sessions paused successfully`.