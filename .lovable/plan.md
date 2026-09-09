# Cobrança do 8º dia de hoje (09/09): o que aconteceu e o que corrigir

## Resposta ao que você perguntou

Hoje entraram no 8º dia **6 pessoas** (todas pagaram os R$ 6,90 no dia 02/09):

| Pessoa | Plano | O que aconteceu hoje |
|---|---|---|
| Geraldo Ribeiro | Direção R$ 49,90 | **Pago** às 05:38 |
| Gisele Pavan | Essencial R$ 29,90 | **Não foi cobrada** — e não será tentada de novo hoje |
| Regina Coeli | Direção R$ 49,90 | **Não foi cobrada** — e não será tentada de novo hoje |
| Fernanda Pereira | Essencial | Autorização recusada pelo banco — não é cobrável por PIX Automático |
| Maria Do Socorro | Essencial | Autorização recusada pelo banco |
| Maria Lucena | Essencial | Autorização recusada pelo banco |

O outro pagamento de hoje (R$ 29,90 às 04:28) é da **Maria**, cujo mensal venceu em **07/09** e só caiu na conta hoje. Ou seja: dos 2 recebimentos de hoje, 1 é do grupo de hoje e 1 é atrasado.

Resumo do dia: 3 tinham autorização viva e podiam ser cobradas → 1 pagou, 2 ficaram sem cobrança. As outras 3 tiveram a autorização negada pelo banco no meio do caminho.

## Por que Gisele e Regina não foram cobradas

A rotina da madrugada detectou que o débito de 09/09 não existia na Woovi e tentou consertar. Mas, ao procurar a parcela em aberto, ela **pega a última da fila em vez da mais antiga vencida** — e a fila do mandato tem parcelas futuras. Resultado: a tentativa foi disparada contra uma parcela de **janeiro de 2027**, e a reconferência ficou agendada para **10/01/2027**. Nada mais acontece hoje para essas duas.

Isso não é um caso isolado: a Maria (paga hoje) e mais alguns mandatos têm a mesma marca de tentativa apontando para datas de 2027.

## O que fazer

1. **Corrigir a escolha da parcela**: passar a usar a parcela em aberto **mais antiga com vencimento até hoje**. Só quando não existe nenhuma vencida é que se olha para a frente — e, nesse caso, sem gastar a tentativa do ciclo atual.
2. **Não deixar a reconferência ir para o futuro distante**: quando a tentativa é do ciclo corrente, o veredito é conferido em 24h. Datas de meses à frente passam a ser tratadas como "parcela errada", não como espera legítima.
3. **Recolocar os casos travados na régua de hoje**: limpar as tentativas apontadas para 2027 e reagendar a conferência de Gisele, Regina e dos demais mandatos vivos com ciclo vencido para as próximas horas, para que o débito de setembro seja pedido ainda hoje.
4. **Régua de recuperação intacta**: quem não pagar segue no fluxo D+2/D+4/D+7 já existente, sem mensagem nova e sem mexer em templates.
5. **Visibilidade**: o painel passa a mostrar, para o dia, quantos venceram, quantos pagaram, quantos aguardam veredito e quantos têm autorização negada — sem inventar categoria nova de alerta.

## Detalhes técnicos

- `supabase/functions/_shared/woovi.ts` → `findUnpaidInstallment`: trocar `unpaid[unpaid.length - 1]` por ordenação crescente por `dueDate` e seleção da mais antiga com `dueDate <= hoje (BRT)`; expor a data escolhida para o chamador decidir. Sem parcela vencida, retornar `null` (o fluxo de ciclo futuro já é coberto por `findScheduledInstallment`).
- `supabase/functions/execute-scheduled-tasks/index.ts` → `scheduleWooviRetryConfirm`: teto de 48h para o `execute_at` quando a parcela tentada é do ciclo corrente; a extensão "1 dia após o vencimento" só vale para vencimento dentro de 10 dias.
- Correção pontual de dados via SQL de manutenção: marcar as linhas `recovery_attempt` com `due_date` em 2027 como inválidas, cancelar as `woovi_retry_confirm`/`woovi_next_cycle_cobr` agendadas para 2027 e inserir `woovi_cycle_recycle` para hoje nos mandatos `ATIVA`/`APROVADA` com `next_charge_date <= current_date` e ciclo sem cobrança.
- `src/pages/AdminEngagement.tsx` (ou o painel Woovi correspondente): bloco diário "venceram / pagos / aguardando veredito / autorização negada" lendo `woovi_subscriptions` + `woovi_charges`.
- Sem migration de schema; edge functions alteradas precisam de novo deploy.
