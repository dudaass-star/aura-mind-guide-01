# Verificação da recuperação silenciosa Woovi: 1 furo real encontrado

Reli as três funções do trilho (`execute-scheduled-tasks`, `webhook-woovi`, `woovi-pix-audit`) e confirmei que as 4 guardas da rodada anterior estão de fato no código: tarefas técnicas rodam sem telefone (`PHONELESS_TASK_TYPES`), a tentativa é logada com `value_cents: 0` e erro de insert vai pro log, mandato revogado encerra a cadência pendente e a auditoria abre `woovi_cycle_recycle` quando o webhook de ciclo não pago não chega. A cadência (retry oportunista → CobR do ciclo seguinte dentro da janela de 5–10 dias → oferta em D+8 do vencimento → Lite em +3 → encerramento em +4) está coerente, com guarda de "já pagou" em todos os passos.

## O furo: a auditoria procura o perfil pela chave errada

No bloco de mandato revogado (churn silencioso) da `woovi-pix-audit`, o perfil é buscado com `profiles.user_id = sub.user_id`. Mas `woovi_subscriptions.user_id` guarda o **id da linha de `profiles`**, não o uid de autenticação — é assim que o `webhook-woovi` grava (`.eq("id", sub.user_id)`) e é assim que o próprio bloco 5 da auditoria já lê (converte `id` → `user_id` antes de criar a tarefa).

Consequência prática: `profileStatus` volta sempre nulo, `userStillActive` é sempre falso e **a mensagem de reautorização com 30% off nunca é enviada** para quem derrubou o débito no app do banco. O mandato é marcado como cancelado em silêncio e o cliente sai sem nenhuma tentativa de retenção. As duas linhas seguintes (upsert e leitura de `user_portal_tokens` com `sub.user_id`) têm o mesmo problema e, se fossem alcançadas, gerariam token para o id errado.

Nenhum dado de produção mascara isso: os 9 mandatos existentes ainda estão com `user_id` nulo (o vínculo só nasce no pagamento), então esse caminho nunca foi exercitado.

## Correção

Em `woovi-pix-audit/index.ts`, bloco 4:
- resolver o perfil uma vez com `profiles.select("user_id, status").eq("id", sub.user_id)`;
- usar o `status` desse resultado para decidir `userStillActive`;
- usar o `user_id` (uid) retornado nas operações de `user_portal_tokens`, caindo para o link `/v2` quando não houver perfil vinculado.

Depois: redeploy de `woovi-pix-audit` e um `dry_run` para confirmar que o relatório de reautorização passa a classificar corretamente.

Sem mudança de estratégia, migração ou alteração na régua de ~37 dias.