# Luiza: o pagamento não passou e o agente ficou mudo

Dois problemas independentes aconteceram com essa lead.

## 1. O PIX Automático dela nunca foi autorizado

Ela abriu o modal, o QR foi gerado e ela copiou o código (todos esses passos estão registrados). O mandato foi criado no gateway em modo composto (1ª semana R$ 6,90 + autorização mensal de R$ 29,90), mas ficou em `CREATED`: não há entrada paga, não há mandato aprovado, não há cobrança correspondente e não chegou nenhum webhook do gateway para ela. Ou seja: a autorização foi interrompida do lado do app do banco — o "Tente mais tarde" que ela viu é do fluxo de autorização, e não temos nenhum registro do banco pagador para afirmar o motivo exato (os logs da função de webhook já saíram da janela de retenção).

## 2. O agente de recuperação não respondeu — e não respondeu ninguém desde 29/08

Ela mandou duas mensagens (13:17 e 13:18 BRT). Nenhuma resposta automática saiu; só a resposta manual do admin às 18:45.

Confirmei que:

- não era horário silencioso, a conversa não estava pausada, não bateu cota, não tinha palavra de parada e o texto não era vazio — nenhuma das travas conhecidas foi acionada (todas deixariam marca no banco, e não há nenhuma);
- **nenhuma chamada ao modelo aconteceu** nesse horário — o agente nem chegou na parte de gerar resposta;
- a função em si está de pé (responde 200 quando chamada agora);
- desde 29/08 11:05 BRT **zero** respostas automáticas saíram, mesmo com vários inbounds nesse período (inclusive um enfileirado de madrugada que também nunca foi respondido).

O padrão aponta para a chamada do webhook ao agente falhando silenciosamente: o webhook grava o inbound, dispara o agente em "fire-and-forget" e devolve 200 ao Twilio. Se essa chamada falha (erro de boot, timeout, término do worker antes do envio), **nada é registrado e o lead fica sem resposta para sempre** — exatamente o quadro observado. Os logs da função já expiraram, então não é possível provar a causa raiz da falha; a correção abaixo garante resposta independentemente dela.

## O que fazer

1. **Nunca perder um inbound.** No webhook, aguardar o resultado da chamada ao agente (dentro do `waitUntil`, sem atrasar o 200 do Twilio) e, se der erro ou exceção, enfileirar a mensagem em `pending_reply_at` / `pending_inbound`. Hoje uma falha aí não deixa nem rastro.
2. **Fila com varredura frequente.** O flush da fila só roda 1x por dia (08:05 BRT). Passar para cada 10 minutos, com guarda de horário silencioso dentro da própria função (o que chega de madrugada continua esperando as 08h).
3. **Redeploy das duas funções** (webhook e agente), porque parte do comportamento em produção pode ser versão antiga — já tivemos drift de deploy antes neste projeto.
4. **Validar sem enviar nada para lead real**: chamar o agente em modo flush com fila vazia, conferir que os inbounds recentes já respondidos não são reprocessados e acompanhar o primeiro inbound real para confirmar resposta automática.
5. **Luiza**: a conversa já foi assumida manualmente pelo admin; nenhuma mensagem automática extra será disparada para ela. O checkout dela continua aberto — se quiser, ela retoma pelo mesmo link.

## Detalhes técnicos

- `supabase/functions/webhook-twilio-recovery/index.ts` (~linha 242): trocar o `.then()` fire-and-forget por uma promise aguardada dentro do `EdgeRuntime.waitUntil`, com `queuePending()` gravando `pending_reply_at`/`pending_inbound` em `recovery_conversations` em caso de `r.error` ou exceção.
- `supabase/functions/recovery-agent/index.ts` (bloco `flush_pending`, ~linha 276): retornar sem flush quando `isQuietHourBRT(cfg.silent_hours_start, cfg.silent_hours_end)` for verdadeiro, para a varredura de 10 min não furar o silêncio noturno.
- Nova migration: `cron.unschedule('recovery-agent-flush-pending')` + `cron.schedule` do mesmo job com `*/10 * * * *`, mantendo o corpo `{"flush_pending": true}`.
- Sem mudança de schema e sem envio de mensagem real durante a verificação.
