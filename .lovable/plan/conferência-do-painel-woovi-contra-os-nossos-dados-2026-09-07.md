# Conferência do painel Woovi contra os nossos dados

Comparei os números da tela com o que temos registrado. **Não está tudo certo** — há três divergências, e uma delas é dinheiro que entrou e não foi reconhecido.

## O que confere

| Painel Woovi | Nosso registro |
|---|---|
| Assinaturas ativas: 73 | 76 mandatos vivos (ATIVA/APROVADA) |
| Assinaturas inativas: 181 | 178 (recusadas, canceladas, aguardando, abandonada) |

Diferença de 3 para cada lado — provavelmente mandatos que a Woovi já marcou como inativos e que aqui continuam vivos. Pequeno, mas precisa ser conferido um por um.

## O que não confere (o problema real)

**1. Dez mensalidades pagas que não entraram no nosso controle.**
A Woovi mostra 29 mensalidades recorrentes pagas, somando R$ 1.342,20. Nós temos 19, somando R$ 608,10. Faltam 10 pagamentos, cerca de R$ 734. O último pagamento mensal que registramos foi em 04/09 — nada de 05, 06 e 07/09, mesmo com vencimentos nesses dias. São pessoas que pagaram e podem estar sendo tratadas como inadimplentes.

**2. Só 8 mensalidades estão agendadas na Woovi.**
O painel diz "próximas 8 parcelas agendadas, R$ 349,20". Nós temos 64 mandatos vivos com vencimento futuro. Ou seja: a grande maioria das próximas mensalidades ainda não existe como cobrança do lado da Woovi. É exatamente a falha que já tratamos em casos isolados, agora visível na escala toda.

## O que fazer

1. **Recuperar os 10 pagamentos perdidos.** Rodar a conferência do extrato numa janela maior (últimos 30 dias em vez de 10), casando cada pagamento pelo identificador do próprio débito, e registrar/ativar quem já pagou. Rodar primeiro em modo simulação e mostrar a lista antes de gravar nada.
2. **Comparar mandato por mandato com a Woovi.** Para cada um dos 64 mandatos vivos com vencimento futuro, verificar se existe mensalidade agendada lá. Onde não existir e a janela permitir, disparar a criação; onde não permitir ainda, deixar registrado para a rodada certa.
3. **Alinhar ativos/inativos.** Conferir os 3 mandatos de diferença e corrigir o status aqui conforme a Woovi.
4. **Vigilância contínua.** Passar a comparar, a cada rodada, "mandatos vivos com vencimento futuro" contra "mensalidades agendadas na Woovi" e agir na diferença, em vez de olhar caso a caso.

## Detalhes técnicos

- `woovi-pix-audit/index.ts`: aumentar `extratoSince` de 10 para 30 dias no bloco de reconciliação por extrato (parametrizável via `body.extrato_days`), mantendo a prova por `endToEndId`/`identifierId` e o cache/orçamento de chamadas já existentes.
- Novo bloco de cobertura: para cada `woovi_subscriptions` com `status in ('ATIVA','APROVADA')` e `next_charge_date >= hoje`, chamar `findScheduledInstallment`; ausência confirmada → `createInstallmentCobr` na parcela existente quando dentro da janela do Bacen (5 a 10 dias antes), senão `scheduled_tasks` com `task_type = 'woovi_next_cycle_cobr'` (dedupe por `subscription_id` + `next_due_date`). `WooviUnavailable` nunca conclui ausência.
- Paginação/orçamento: varredura em lotes por rodada respeitando `MIN_INTERVAL_MS` e o limite de taxa da Woovi, com cursor por `next_charge_date`.
- Sincronização de status: consultar `/api/v1/subscriptions/{globalID}` dos mandatos divergentes e aplicar `normalizeMandateStatus`.
- Sem migração de banco. Deploy apenas de `woovi-pix-audit` (e `execute-scheduled-tasks` se o executor precisar de ajuste).
- Entregar a lista dos pagamentos recuperados e dos mandatos sem parcela em CSV em `/mnt/documents/relatorios/`.
