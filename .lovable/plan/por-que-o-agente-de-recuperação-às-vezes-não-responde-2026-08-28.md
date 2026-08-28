# Por que o agente de recuperação às vezes não responde

Levantei os últimos 30 dias na inbox de recuperação: **155 mensagens recebidas de leads, 92 respondidas, 63 sem resposta (41%)**. Não é falha aleatória — são 6 travas do próprio agente que hoje terminam em silêncio total.

## O que está causando o silêncio (dados reais)

| Causa | Mensagens sem resposta | Leads |
| --- | --- | --- |
| Conversa pausada como "usuário ativo" | 40 | 11 |
| Fora de horário (22h–08h BRT) e mensagens curtas | 11 | 10 |
| Limite de 3 respostas automáticas atingido | 8 | 3 |
| Lead pediu humano (pausa correta) | 4 | 3 |
| Mensagem só com anexo (PDF/imagem) | 4 | — |

Exemplos do print: Ritiele escreveu "Pagamento só amanhã" à 01h34 (horário silencioso, ninguém respondeu depois); Ericlea pediu humano (pausa correta); Cleide e Luciana caíram na pausa de "usuário ativo" e ficaram sem resposta mesmo perguntando sobre cobrança.

O problema comum: **toda trava hoje é um silêncio permanente e invisível** — nada é reenfileirado, nada avisa o admin.

## O que fazer — o agente passa a responder

1. **Madrugada não descarta mais**: mensagem que chega entre 22h e 08h fica marcada como pendente e é respondida automaticamente às 08h BRT. Nada de mensagem perdida por horário.
2. **Cliente ativo também recebe resposta**: hoje, se o telefone bate com um cliente ativo, o agente cala. Passa a responder normalmente essas dúvidas (cobrança, acesso, cancelamento, como usar) usando a mesma base de conhecimento — sem venda, só resolvendo. Continua sem responder quem pediu humano de verdade.
3. **Limite de respostas deixa de matar a conversa**: o teto sobe de 3 para 8 e volta a zerar quando o lead reabre a conversa depois de 48h. Enquanto o lead pergunta, o agente responde.
4. **Anexo (PDF/print de comprovante) passa a ser lido**: em vez de ignorar mensagem sem texto, o agente responde ao contexto do anexo — comprovante em geral significa "paguei, e agora?", e a resposta certa é confirmar o caminho de acesso.
5. **Mensagem curta ganha resposta curta**: "ok", "ta bom", "obrigada" hoje entram na lista de ignorados. Passam a receber uma resposta curta de fechamento (ou o link, quando o lead já estava perto de pagar), em vez de silêncio.

## Detalhes técnicos

- `supabase/functions/recovery-agent/index.ts`: guard `isActiveUser` deixa de encerrar a execução — vira flag `isCustomer` injetada no prompt (modo suporte: sem pitch, sem link de checkout, orienta portal/acesso). Guards de `short_greeting` e mensagem vazia passam a gerar resposta curta em vez de `skip`.
- Quiet hours: gravar `pending_reply_at` + `pending_inbound` em `recovery_conversations` (migração com as colunas novas) e um cron às 08h05 BRT que reinvoca `recovery-agent` para cada pendência, limpando o campo ao responder.
- Anexos: `webhook-twilio-recovery` já grava `media_url`; o agente passa a montar o texto do turno como "[anexo recebido]" + legenda, e a KB responde o caso "mandei comprovante".
- `recovery_agent_config.max_auto_replies`: 3 → 8; reset de `auto_reply_count` quando o último inbound é anterior a 48h.
- Envio segue exclusivamente pela subaccount Twilio de recuperação (`_shared/twilio-recovery-client.ts`).

