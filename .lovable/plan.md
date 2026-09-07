# Checagem completa do PIX Automático (Woovi) — do dado à régua de cobrança

Fiz uma conferência agora, antes de propor qualquer mudança. O trilho está funcionando, mas **não está redondo**: há mandatos vivos com ciclo vencido e sem cobrança, erros antigos pendurados e registros de mensalidade incompletos.

## O que conferi agora (números reais)

- **Mandatos:** 75 vivos (63 ATIVA + 12 APROVADA), 157 recusados, 12 cancelados, 9 aguardando, 1 abandonado.
- Dos 74 vivos sem substituição: **68 com próxima cobrança no futuro, 6 já vencidos** e **9 com erro registrado**.
- **Erros pendurados hoje:** 4 casos "ciclo sem cobrança na Woovi", 4 em "retentativa solicitada" que nunca voltaram com resposta, 1 recusado com erro 400 na criação da cobrança, 1 "sem parcela agendada (cobr 400)".
- **Mensalidades pagas:** 25 registradas (última em 06/09; nada em 07/09). Entradas semanais: 104, todas pagas.
- **Registro incompleto:** todas as 25 mensalidades estão **sem data de vencimento gravada** — dá para saber que pagou, não dá para conferir se pagou no dia certo.
- **Webhooks:** 396 eventos, todos processados, nenhum na fila. Isso está saudável.
- **Rotinas:** conferência a cada 15 min e reconciliação de extrato a cada 10 min, ambas ativas; 153 reciclagens de ciclo executadas hoje.

Ou seja: o dinheiro que entra está sendo reconhecido, mas **quem falha fica parado** em vez de andar sozinho até virar cobrança, recuperação ou encerramento.

## O que a revisão vai fazer

1. **Conferência linha a linha com a Woovi (primeiro em simulação).**
   Mandato por mandato dos 74 vivos: status lá vs. aqui, próxima mensalidade agendada lá vs. nossa data, e extrato dos últimos 90 dias contra nossos registros. Saída: lista de divergências separada em dinheiro não registrado, mensalidade que não existe na Woovi, status desalinhado e mandato morto tratado como vivo.

2. **Zerar a fila de pendências.** Cada um dos 9 erros e dos 6 vencidos termina em um destino: cobrança criada na janela permitida, retentativa encadeada, recuperação com o cliente ou encerramento do mandato. Nenhum fica "com erro" sem próxima ação marcada.

3. **Fechar o buraco da retentativa sem resposta.** Hoje uma retentativa pedida à Woovi pode ficar para sempre em "solicitada". Passa a ter reconferência automática: se em 24h não houve pagamento nem recusa, pergunta de novo à Woovi e decide.

4. **Completar o registro das mensalidades.** Gravar vencimento e ciclo em toda cobrança de mensalidade (inclusive corrigindo as 25 existentes a partir do dado da Woovi), para que "pagou no dia certo" seja verificável.

5. **Régua de cobrança escrita e verificada de ponta a ponta.** Vencimento → 3 tentativas em 7 dias pelo próprio mandato → recuperação silenciosa dentro da janela permitida → conversa com o cliente → encerramento. Confirmo caso por caso que cada etapa realmente dispara, e corrijo onde estiver furada.

6. **Vigilância diária que se conserta sozinha.** Comparação automática dos totais (mandatos vivos, mensalidades agendadas, pagas no mês) com a Woovi, agindo na diferença — sem avisos ao admin, resolvendo direto.

7. **Entrega.** Um relatório em Arquivos com números conferidos, divergências resolvidas, o que ficou dependendo da Woovi e a régua por escrito.

## Detalhes técnicos

- Leitura e ajuste apenas em: `woovi-pix-audit`, `execute-scheduled-tasks` (casos `woovi_*`), `webhook-woovi`, `_shared/woovi.ts`, `dunning-whatsapp.ts`. Sem migração de banco.
- Reconciliação com `dry_run` primeiro: `/api/v1/subscriptions` paginado, `/api/v1/subscriptions/{id}/installments` (lendo `dateGenerateCharge`/`cobr.dueDate`), `/api/v1/transaction` paginado em 90 dias (`limit`/`skip`), respeitando `MIN_INTERVAL_MS` e o 429 — `WooviUnavailable` nunca conclui ausência.
- Bloco 5 do audit: envolver a consulta de `dueSubs` em try/catch de `WooviUnavailable` para 429 não descartar o mandato da rodada.
- `woovi_charges` kind `cycle`: preencher `due_date` no webhook e no audit (backfill dos 25 existentes por `installment_id`).
- Novo estado de reconferência para `RETRY_REQUESTED`/`COBR_CREATED`: `scheduled_tasks` `woovi_retry_confirm` em 24h, dedupe por `subscription_id` + `installment_id`; resolução via `replayToWebhook` (fonte única de ativação).
- Criação de cobrança só via `createInstallmentCobr` na janela de 5–10 dias antes do vencimento; nada de gravação direta de status de pagamento.
- Reconciliador diário de totais com auto-correção, sem alertas. Relatório e CSVs em `/mnt/documents/relatorios/`.
