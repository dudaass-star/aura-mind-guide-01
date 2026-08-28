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

## O que fazer

1. **Fila noturna (22h–08h)**: em vez de descartar, marcar a conversa como pendente e disparar um cron às 08h BRT que responde a última mensagem do lead. Fim do silêncio da madrugada.
2. **Pausa "usuário ativo" deixa de ser buraco**: manter a pausa do bot, mas (a) mandar uma resposta única de reconhecimento com o caminho certo (meu-espaço / suporte) e (b) marcar a conversa como "precisa de humano" com destaque no painel, para o admin ver que existe alguém esperando.
3. **Limite de respostas**: subir o teto de 3 para 6 e, ao bater o teto, enviar uma última mensagem de encerramento com o e-mail de suporte em vez de simplesmente parar. Reabrir a cota se o lead voltar depois de alguns dias em silêncio.
4. **Mensagem só com anexo**: responder confirmando o recebimento e escalar por e-mail (hoje não gera nada).
5. **Mensagens curtas ("ok", "ta bom", "obrigada")**: responder curto uma vez em vez de ignorar sempre — só ignorar se a anterior já foi uma resposta a esse mesmo tipo de mensagem.
6. **Visibilidade**: gravar o motivo do último "não respondi" na conversa e mostrar esse rótulo na inbox admin, com filtro "sem resposta". Assim o furo aparece no mesmo dia, não depois de dias.

## Detalhes técnicos

- `supabase/functions/recovery-agent/index.ts`: reordenar os guards; cada `skip` passa a gravar `auto_paused_reason` / novo campo `last_skip_reason` + `pending_reply_at` em `recovery_conversations` (migração para as duas colunas novas).
- Novo cron (`*/10 * * * *`, ativo a partir das 08h BRT) que varre `recovery_conversations` com `pending_reply_at` e reinvoca `recovery-agent` com o último inbound.
- `recovery_agent_config.max_auto_replies`: 3 → 6; reset de cota por inatividade (ex.: 72h sem inbound).
- `src/components/admin/RecoveryInbox.tsx`: badge do motivo do silêncio e filtro "sem resposta".
- Envio continua exclusivamente pela subaccount Twilio de recuperação (`_shared/twilio-recovery-client.ts`), respeitando quiet hours no envio.
