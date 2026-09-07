# Por que a cobrança mensal não saiu no PIX Automático Woovi — causa nova encontrada e correções

## Regra que passa a valer

Cliente que autorizou o PIX Automático e pagou a entrada nunca pode passar do dia do débito sem cobrança criada. Se em algum momento não houver certeza de que a cobrança existe, o sistema tem que insistir e deixar o caso visível — nunca seguir em silêncio.

## Causa nova (encontrada agora nos registros)

A Woovi está respondendo "limite de taxa excedido" (429) em praticamente todas as nossas consultas de assinatura e de parcelas. A conferência roda a cada 15 minutos e varre até 200 mandatos com pausa de 0,25s — muito acima do que a Woovi aceita.

Consequência direta, e é o coração do problema: quando a consulta é recusada, o nosso código não distingue "a Woovi recusou a pergunta" de "não existe parcela". Ele conclui que não há parcela, registra "parcela futura ausente" e passa adiante sem criar a cobrança. Ou seja: a guarda preventiva que criamos está cega justamente nos casos que ela deveria salvar.

## Correções

### 1. Nunca tratar recusa da Woovi como "não existe parcela" (crítico)
As consultas passam a devolver três respostas distintas: existe parcela, não existe parcela, ou não foi possível saber. No terceiro caso, nada é concluído: o caso é reagendado para nova tentativa, e não sai da fila até ter resposta.

### 2. Respeitar o limite da Woovi
Uma fila única de chamadas com espaçamento maior, recuo automático quando vier 429 (aguardar o tempo que ela pede e repetir), lote menor por rodada e retomada de onde parou na rodada seguinte. Sem isso, qualquer proteção continua cega.

### 3. Mandato sem nenhuma parcela deixa de ser só uma anotação
Quando a resposta for confirmada e realmente não houver parcela, tentar criar a ordem de débito; se a Woovi não permitir, marcar o mandato com o motivo e a data em risco, para o caso ficar visível no relatório em vez de morrer num registro técnico.

### 4. Pagamento feito por outra pessoa
A conferência do extrato olha só 3 dias e casa o pagamento pelos dados de quem pagou; quando paga o marido/familiar, o dinheiro entra e a cliente fica marcada como não cobrada. Ampliar para 10 dias e, sem casar o pagador, casar pelo mandato (valor esperado próximo do vencimento previsto, sem pagamento registrado). Sem match, registrar como pagamento órfão.

### 5. Os 5 pagamentos antigos
Cirlei, Adriana Gomes, Jaqueline Mattos, Rosemeire e Ritiele pagaram e continuam sem registro — reprocessar pelo identificador da transação depois da correção 4.

## Detalhes técnicos

- `_shared/woovi.ts`: `wooviFetch` com respeito a `retryAfter` (recuo e repetição, com teto de tentativas) e fila serializada; `findScheduledInstallment` / `findUnpaidInstallment` passam a devolver `{ ok, installment }` em vez de `null` ambíguo (hoje `if (!r.ok) return null`), ou lançar um erro tipado `WooviUnavailable`.
- `woovi-pix-audit/index.ts` bloco 5: tratar `WooviUnavailable` como "reconferir" (não gerar item em `ciclo_sem_cobranca`, não pular o mandato definitivamente); `.limit(200)` reduzido com cursor por `next_charge_date` e persistência do último processado, para caber no limite da Woovi em 15 min.
- `woovi-pix-audit/index.ts` bloco 6: `extratoSince` de 3 → 10 dias e fallback de match por `value` + proximidade de `next_charge_date` de mandato ativo sem `woovi_charges.paid_at`; replay continua sendo o único caminho de ativação.
- `execute-scheduled-tasks/index.ts`, `woovi_next_cycle_cobr`: distinguir indisponibilidade de ausência (hoje `!(await findUnpaidInstallment())` encerra como regularizado e a ausência de parcela cai direto em `woovi_recovery_offer` em 8 dias); em indisponibilidade, reagendar em 1h.
- Reprocessamento dos 5 casos via `woovi-pix-audit` modo extrato, com `dryRun` antes.
- Sem migração de banco. Redeploy: `woovi-pix-audit`, `execute-scheduled-tasks`.
