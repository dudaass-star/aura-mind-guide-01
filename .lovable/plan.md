# Auditoria da recuperação silenciosa (Woovi PIX) — 4 correções

A cadência de ~37 dias está no ar e a lógica principal confere: nenhum aviso de falha, acesso preservado, CobR só dentro da janela do Bacen, cancelamento da cadência quando o dinheiro entra e oferta com QR novo no fim. Mas a leitura do código junto com o schema real mostrou 4 pontos que podem quebrar a régua em produção.

## 1. Tarefa técnica morre se o usuário não tiver telefone (crítico)
O laço de tarefas busca o `profiles.phone` antes de qualquer coisa e marca a tarefa como `failed` se não houver telefone. As tarefas de recuperação `woovi_cycle_recycle` e `woovi_next_cycle_cobr` não mandam mensagem — elas **cobram**. Hoje, um cadastro sem telefone perde a criação da CobR do ciclo seguinte e a assinatura morre sem nenhuma tentativa de débito.

Correção: permitir tarefas técnicas sem telefone. Lista de tipos que seguem sem `phone` (as duas de CobR); as que falam com o cliente (`woovi_recovery_offer`, `woovi_recovery_final`) continuam exigindo.

## 2. Log de tentativa é descartado quando o valor é 0
`woovi_charges.value_cents` é `NOT NULL`, e o log grava `valueCents || null`. Se o mandato estiver sem `value_cents`, o insert falha e a tentativa desaparece do histórico (o erro é engolido pelo `catch`). Como o objetivo desse log era justamente enxergar em que volta a régua está, é uma cegueira silenciosa.

Correção: gravar `0` em vez de `null` e logar em `console.error` quando o insert retornar erro (hoje só o `throw` é capturado, não o erro retornado pelo client).

## 3. Auditoria de mandato revogado pode duplicar a conversa
Quando o cliente derruba o débito no app do banco durante a janela silenciosa, `woovi-pix-audit` manda a mensagem de reautorização com 30% off — e a cadência de recuperação segue pendente, então dias depois chega a oferta de novo (`woovi_recovery_offer`), possivelmente com outro degrau.

Correção: ao notificar churn silencioso, cancelar as tarefas de recuperação pendentes daquele `subscription_id` (mesma função já usada no caminho de pagamento). Mandato morto não tem o que cobrar, então a conversa passa a ser só a da auditoria.

## 4. Ciclo perdido sem webhook não inicia recuperação nenhuma
Toda a régua começa no evento de ciclo não pago do webhook. Se a Woovi não emitir esse evento (ou ele falhar), ninguém percebe: não há varredura que compare parcelas vencidas em aberto com cadências ativas. O cliente simplesmente para de pagar e continua com acesso.

Correção: acrescentar à `woovi-pix-audit` uma varredura de mandatos ativos com parcela vencida em aberto e sem tarefa de recuperação pendente, abrindo a cadência (`woovi_cycle_recycle`) do mesmo jeito que o webhook faria. Rede de segurança, idempotente pelo mesmo `contains(payload)` já usado.

## Detalhes técnicos
- `execute-scheduled-tasks/index.ts`: conjunto `PHONELESS_TASK_TYPES` checado antes do `continue` por falta de telefone; `logWooviAttempt` com `valueCents ?? 0` e checagem do `error` do insert.
- `woovi-pix-audit/index.ts`: chamar o cancelamento de tarefas no bloco de mandato revogado; novo bloco 5 de varredura de parcela vencida usando `findUnpaidInstallment` + `daysUntil` (só abre a cadência se o vencimento já passou).
- Sem migração: `woovi_charges.kind`, `scheduled_tasks.executed_at` e o status `canceled` já existem e não têm CHECK constraint.
- Depois: redeploy de `execute-scheduled-tasks` e `woovi-pix-audit`.

Sem mudança de estratégia: os ~37 dias, o silêncio total e a escada 30% off → Lite → encerramento ficam como estão.
