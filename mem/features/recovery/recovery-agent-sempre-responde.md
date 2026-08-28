---
name: recovery-agent sempre responde
description: Guards do recovery-agent que antes causavam silêncio (cliente ativo, madrugada, cota, anexo, mensagem curta) agora geram resposta
type: feature
---

Diagnóstico ago/2026: 63 de 155 inbounds (41%) da inbox de recuperação ficavam **sem nenhuma resposta** — todo guard do `recovery-agent` terminava em `skip` definitivo. Correções aplicadas em `supabase/functions/recovery-agent/index.ts`:

- **Cliente ativo (era 40 inbounds/11 leads)**: `isActiveUser` virou `getCustomer()` e NÃO derruba mais a execução. Quando o telefone é cliente (active/trial/canceling/past_due), o agente entra em **MODO SUPORTE**: responde direto (cobrança, acesso, cancelamento, como usar), sem venda, sem vitrine de valor e com o link de checkout removido do texto (`sendLink` forçado a false).
- **Madrugada (22h–08h BRT)**: em vez de descartar, grava `pending_reply_at` + `pending_inbound` em `recovery_conversations`. Cron `recovery-agent-flush-pending` (`5 11 * * *` UTC = 08h05 BRT) chama `recovery-agent` com `{"flush_pending": true}`, que reinvoca o agente por telefone pendente (limite 50/execução) e limpa os campos.
- **Cota**: `max_auto_replies` 3 → 8 e `auto_reply_count` zera quando o lead reabre a conversa após 48h sem inbound. Pausa definitiva apenas para `user_requested_human`, `lead_declined`, `escalated_email` (`HARD_PAUSES`) — `active_user` e `limit_reached` não travam mais.
- **Anexo sem texto**: se o último inbound tem `media_url`, o turno vira "[anexo sem texto]" e a instrução manda tratar como "paguei/mandei comprovante, e agora?" (confirma acesso automático + email de suporte), sem pedir reenvio e sem vender.
- **Mensagem curta** ("ok", "obrigada", "beleza"): não é mais ignorada; instrução de resposta em no máximo 2 frases, com `[ENVIAR_LINK]` quando o lead ainda não pagou.

Nada de alerta pro admin nem painel de furos: a regra é o agente responder, não sinalizar que deixou de responder.
