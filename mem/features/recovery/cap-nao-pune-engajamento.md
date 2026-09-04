---
name: Cap de recuperação não pune engajamento
description: Cap de 30 dias conta só templates proativos; conversa ativa pausa o estágio sem fechar; irmãos de telefone só em 6h
type: feature
---

Caso Luciana (04/09/2026): recebeu o template copiou_20min, clicou em "Ficou uma dúvida", trocou 3 perguntas com o `recovery-agent` e acumulou 5 mensagens de saída em 35 min → foi tratada como telefone queimado (`phone_window_cap`) e saiu da sequência. Lead engajada é a mais quente; punir engajamento é o inverso do objetivo.

Regras atuais em `recover-abandoned-checkout-whatsapp/index.ts`:

- **Cap 30d conta só campanha**: mensagens `recovery_messages` (out, não-admin) com `metadata.template`, `metadata.track` ou `metadata.content_sid`. Respostas do agente dentro de conversa NÃO contam. `CAP_LIMIT = 3` templates por número em 30 dias (era 2 mensagens de qualquer tipo). Efeito imediato: variações banidas caíram de **576 → 84**.
- **Conversa ativa pausa, não bane**: set `activeConversationPhones` (inbound nas últimas 48h) → estágio adiado sem marcar `*_sent_at`, reavaliado na rodada seguinte. Log `💬 conversa ativa, adiando`.
- **`stageFailureCount` ignora falhas de infraestrutura**: erro em `INFRA_FAILURE_PATTERNS` (SID/template inválido, 5xx) não conta para `MAX_STAGE_FAILURES = 3` — corrigido o template, o lead volta à fila.
- **`markPhoneSiblings` com janela de 6h** (`SIBLING_WINDOW_MS`): fecha só o duplo clique real; checkout de outro dia é oportunidade nova.
- `AdminEngagement.tsx` → `SKIP_LABELS`: `conversa_ativa` e `duplicate_phone_sibling` traduzidos.

Reabertura pontual (04/09/2026): 26 checkouts dos últimos 7 dias fechados por `phone_window_cap` / `max_failures_*` / `duplicate_phone_sibling` tiveram os marcadores dos estágios **nunca enviados** zerados. Primeira rodada depois disso: 20 envios, 0 falhas.
