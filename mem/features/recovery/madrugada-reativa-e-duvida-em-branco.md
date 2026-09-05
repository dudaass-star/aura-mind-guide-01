---
name: Recovery agent — madrugada reativa e dúvida em branco no conjunto
description: Horário silencioso não vale para inbound reativo; blankDoubt/shortAck avaliados sobre todos os inbounds desde o último outbound
type: feature
---

Caso Marcinha (5511974460990, 04-05/09/2026): escreveu 22h36 "Não entendi direito o que é" + "Terapia ???" + clique "Ficou uma dúvida"; resposta só às 08h05 e apenas "qual ficou?".

Correções em `supabase/functions/recovery-agent/index.ts`:

- **Quiet hours (22h–08h BRT) só bloqueia iniciativa nossa.** Se houver outbound nosso nas últimas 24h OU `checkout_sessions.pix_copied_at` nas últimas 24h, o inbound é **reativo** e o agente responde na hora. Log: `quiet_hours ignorado: inbound reativo`.
- **`pending_inbound` concatena** (não sobrescreve) o que já estava pendente, `slice(-1000)`.
- **`blankDoubt` e `shortAck` viraram `let`** e são recalculados sobre `unanswered` = inbounds desde o último outbound em `historyAsc` (+ o texto atual se ausente). `blankDoubt` só é true se TODOS baterem em `isBlankDoubt`; `text` passa a ser o conjunto juntado por `\n`.
- KB nova em `como_funciona`: "Não entendi direito o que é a Aura" (não é terapia, companhia diária + encontros de 45min), priority 8.

`deno check` acusa erro pré-existente em `_shared/taster.ts:287` (`correlationID`), não impede deploy.
