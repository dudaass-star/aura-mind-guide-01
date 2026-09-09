---
name: Semântica do painel de recuperação de checkout
description: recovery_sent é flag de bloqueio (PIX), não de envio; datas de estágio também são gravadas em pulos
type: feature
---

No painel "Recuperação de Checkout Abandonado" (`src/pages/AdminEngagement.tsx`):

- `checkout_sessions.recovery_sent` NÃO significa "recebeu recuperação". Os fluxos de PIX (`criar-pix-recorrente-woovi|asaas|inter`, `criar-pix-asaas`) marcam `recovery_sent = true` só para BLOQUEAR o carrinho abandonado. Nunca usar essa flag como critério de entrada no painel nem como contagem de envios.
- Critério de entrada no painel = atividade real: `recovery_stage{1,2,3}_sent_at`, `whatsapp_recovery_{15min,24h}_sent_at` ou `whatsapp_recovery_last_error`.
- As colunas `*_sent_at` também são preenchidas quando o estágio é PULADO (markStageSkipped, para não reavaliar). Enviado só quando existe attempt `stage_N_sent` / `wa_stage_N_sent` (ou, em linhas legadas sem attempt algum, quando não há `skipped:` no `*_last_error`).
- `checkout_recovery_attempts` tem ~14k linhas `wa_stage_2_failed` (retentativas). Consultas do painel filtram uma whitelist de status para não puxar esse volume.
- Atribuição: recuperada = pagou depois de um contato ENVIADO; "voltou sozinha" = pagou antes de qualquer envio. Todos os contadores do card (e-mail, WhatsApp, resultado) devem usar o mesmo universo, com paginação de 1000 linhas.
- "Legado" foi removido: sem envio a coluna mostra "—".
