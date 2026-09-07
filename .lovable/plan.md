# Falha de cobrança no PIX Automático Woovi — o que já está coberto e os 3 furos que restam

## O que já está no ar (verificado no código)

- A conferência roda a cada 15 minutos (`woovi-pix-audit`), mais a reconciliação de extrato a cada 10 minutos.
- Existe a guarda preventiva: mandatos com débito previsto nos próximos 10 dias são conferidos e, quando a parcela existe e está na janela legal (5 a 10 dias antes), a ordem de débito é criada por nós, sem depender da Woovi.
- Existe o backstop pós-vencimento: ciclo vencido sem cobrança abre recuperação em vez de encerrar como "regularizado".
- "Nenhuma parcela encontrada" já não é mais tratado como pagamento em dia.

Ou seja: o caso em que a Woovi cria a parcela mas esquece de gerar a ordem de débito está resolvido. Os 3 pontos abaixo ainda podem repetir o prejuízo.

## Furo 1 — mandato sem nenhuma parcela na Woovi fica só anotado (crítico)

Foi exatamente o cenário dos 9 casos: a Woovi não tinha parcela alguma. Hoje, quando a conferência não encontra parcela futura, ela apenas registra "parcela futura ausente" no relatório e passa adiante. Ninguém é avisado e nada é criado — o mês seguinte vence do mesmo jeito.

Correção: nesse caso, tentar recriar a parcela/ordem de débito do mandato na Woovi; se a API não permitir, marcar o mandato com o motivo e registrar como pendência de intervenção com data do vencimento em risco, para aparecer no relatório diário em vez de morrer num log.

## Furo 2 — pagamento feito por outra pessoa continua invisível

A conferência do extrato só olha 3 dias para trás e casa o pagamento pelo CPF/e-mail/telefone de quem pagou. Nos 5 casos em que o marido/familiar pagou, o dinheiro entrou e a cliente segue marcada como não cobrada — podendo até cair na régua de cobrança.

Correção: ampliar a janela do extrato de 3 para 10 dias e, quando o pagador não bate com nenhum cadastro, casar pelo mandato: valor esperado do plano dentro da janela do vencimento previsto de um mandato ativo sem pagamento registrado. Sem match, registrar como pagamento órfão em vez de ignorar.

## Furo 3 — os 5 pagamentos antigos ainda não foram registrados

Cirlei, Adriana Gomes, Jaqueline Mattos, Rosemeire e Ritiele pagaram e continuam sem registro. Com a janela de 10 dias os mais recentes entram sozinhos; os antigos precisam de um reprocessamento pontual pelo identificador da transação.

## Detalhes técnicos

- `woovi-pix-audit/index.ts`, bloco 5: no ramo `!installment?.globalID`, tentar `POST /api/v1/subscriptions/{id}/installments` (ou recriação equivalente conforme resposta da API) e, em falha, gravar `last_error` + item em `ciclo_sem_cobranca` com `next_charge_date`; alimentar o relatório existente.
- `woovi-pix-audit/index.ts`, bloco 6: `extratoSince` de 3 → 10 dias; adicionar fallback de match por `value` + proximidade de `next_charge_date` de mandato ativo sem `woovi_charges.paid_at` no ciclo; manter o replay para `webhook-woovi` como fonte única de ativação.
- `execute-scheduled-tasks/index.ts`, `woovi_next_cycle_cobr`: quando `source = pre_due_guard` e não há parcela, não agendar `woovi_recovery_offer` (hoje agenda em 8 dias) — reagendar reconfirmação em 24h.
- Reprocessamento dos 5 casos via `woovi-pix-audit` em modo extrato com janela estendida, checando `dryRun` antes.
- Sem migração de banco. Redeploy: `woovi-pix-audit`, `execute-scheduled-tasks`.
