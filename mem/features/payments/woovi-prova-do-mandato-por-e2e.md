---
name: Prova do mandato por endToEndId (Woovi)
description: Pagamento do extrato Woovi só é atribuído a um mandato pela prova do endToEndId/identifierId da parcela; pagador do extrato é o titular da conta, não o cliente
type: feature
---

No PIX Automático da Woovi, o extrato mostra o TITULAR DA CONTA que pagou (marido, filho, familiar) — CPF, e-mail, telefone e `payer.correlationID` NÃO servem para atribuir dono.

Prova determinística: `GET /api/v1/subscriptions/{globalID}/installments` traz, na parcela, `cobr.endToEndId`, `cobr.identifierId` e `cobr.tries[].endToEndId`. Quando um desses é igual ao `endToEndId`/`transactionID` do extrato, o dono está provado. Sem essa prova e com mais de um candidato, NÃO atribuir.

Regras da varredura do extrato em `woovi-pix-audit`:
- Janela de candidatos estreita: `next_charge_date` entre -7 e +3 dias do pagamento, ordenada por vencimento (janela larga com limite de linhas escondia o candidato certo).
- Ordem de checagem por suspeita: mandatos com `last_error` de "sem cobrança/sem parcela" primeiro, depois vencimento mais próximo; no máximo 4 consultas por pagamento.
- Woovi limita taxa (429 pedindo 60s): pagamento já gravado em `woovi_charges.installment_id` nem entra na varredura, e as parcelas consultadas ficam em cache por rodada. Orçamento de chamadas de prova por rodada: 4.
- Indisponibilidade (429/5xx) nunca vira "não existe parcela" — reconferir na rodada seguinte.
- Não existe criar parcela por fora: `POST /api/v1/subscriptions/{id}/installments` responde 405. O reparo é criar/retentar a CobR de uma parcela existente (`createInstallmentCobr`).

Caso resolvido (07/09/2026): Adriana Gomes (pago por Raphael de Souza Barbosa, 01/09) e Jaqueline Mattos (pago por Débora T Souza, 04/09) — R$ 29,90 cada, provados por E2E e regularizados via replay do webhook.
