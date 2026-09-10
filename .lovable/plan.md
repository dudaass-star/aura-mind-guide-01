# Defesa automática de disputas de PIX (MED) na Woovi

## O caso que está aberto agora

A disputa aberta é sobre a mensalidade de R$ 29,90 da Tamara Sabino, cobrada em 08/09 pelo PIX Automático. Os dados internos mostram uma cliente real e ativa, não uma fraude:

- pagou a entrada de R$ 6,90 em 01/09 e autorizou o débito mensal no próprio banco;
- a mensalidade de R$ 29,90 foi debitada em 08/09 pelo mandato autorizado (banco 548 — Woovi/Pix Automático);
- 625 mensagens trocadas com a Aura e 2 encontros realizados;
- a última conversa dela foi em 08/09 às 22:49, ou seja, no mesmo dia da cobrança contestada.

Ou seja: temos como provar consentimento e serviço entregue.

## Por que o outro caso foi ganho "sem fazer nada"

Numa disputa MED quem decide é o Banco Central, não a Woovi. Ele rastreia o dinheiro e, quando não encontra indício de golpe, encerra a disputa como rejeitada — mesmo sem defesa nossa. É sorte, não estratégia: se ninguém responde, o padrão passa a ser devolver o valor e acumular marcas de fraude na conta. É exatamente esse risco à conta Woovi que o plano remove.

## Como vamos responder (padrão de defesa)

Um dossiê curto e objetivo, sempre com os mesmos quatro pilares:

1. **Consentimento**: data e hora da autorização do PIX Automático no app do banco do próprio cliente, valor autorizado e plano contratado.
2. **Identidade**: nome, e-mail, telefone e CPF informados no checkout, batendo com o pagador.
3. **Serviço entregue**: quantidade de mensagens trocadas, encontros realizados e data da última interação — normalmente depois da cobrança contestada.
4. **Histórico de pagamento**: entrada paga, mensalidades pagas, nenhuma cobrança fora do combinado, mais o texto de política (cancelamento livre, sem multa) e nossa disposição de reembolsar direto se for insatisfação.

Regra de conduta: quando o cliente de fato não usou o serviço e o valor é baixo, não brigamos — devolvemos e encerramos. Brigar em caso perdido é o que suja a conta.

## O que vai ser construído

1. **Detecção automática da disputa.** Passar a receber e guardar os avisos de disputa da Woovi (abertura, evidência recebida, resolução), ligando cada disputa ao cliente pelo identificador da transação que já guardamos.
2. **Montagem automática do dossiê.** Para cada disputa nova, gerar um PDF com os quatro pilares acima, mais o comprovante da autorização e a linha do tempo de uso, e enviar como evidência pela API da Woovi.
3. **Painel de disputas no admin.** Lista com cliente, valor, status, evidência enviada e resultado, para acompanharmos sem depender do painel da Woovi.
4. **Envio da defesa do caso da Tamara.** Assim que o fluxo estiver de pé, gerar e enviar o dossiê dela, que hoje está com 0 evidências anexadas.
5. **Prevenção.** Contabilizar disputas por mês no painel e, quando um cliente reclamar de cobrança não reconhecida na conversa, resolver na hora (reembolso/cancelamento) antes de virar MED.

## Detalhes técnicos

- **Webhook**: assinar os eventos `OPENPIX:DISPUTE_CREATED` (e demais eventos de disputa) no `webhook-woovi`, persistindo em nova tabela `woovi_disputes` (dispute_id, end_to_end_id, type MED/CHARGEBACK, status, user_id, value_cents, evidence_sent_at, resolution, raw_payload) com RLS admin-only e GRANTs.
- **Vínculo do cliente**: `dispute.endToEndId` casa com `woovi_charges.installment_id` (o caso atual é `E548114172026090815003LhjFVQJ5n9`); fallback por valor + data + `payer_bank`.
- **Envio de evidência**: edge function `woovi-dispute-defense` que (a) monta o PDF, (b) faz `POST /api/v1/files` com `purpose=DISPUTE_EVIDENCE` (requer escopo `FILE_POST` e feature `DISPUTE_EVIDENCE_FILE_ID`), (c) `POST /api/v1/dispute/{id}/evidence` com `fileId` + `description` + `correlationID`. Fallback: se a conta não tiver a feature (erro 403 `DISPUTE_EVIDENCE_FILE_ID_NOT_ALLOWED`), subir o PDF no bucket de storage e enviar por `url`.
- **Dados do dossiê**: `woovi_subscriptions` (mandate_approved_at, customer_*, value_cents, plan, payer_bank), `woovi_charges` (entrada + ciclos pagos), `messages`/`sessions` (contagens e datas), sem transcrever conteúdo terapêutico — apenas metadados de uso, preservando o sigilo da conversa.
- **Idempotência**: uma evidência por disputa (`evidence_sent_at`), reenvio manual explícito no painel.
- **Métricas**: disputas/100 pagamentos PIX no admin, para vigiar a saúde da conta Woovi.
