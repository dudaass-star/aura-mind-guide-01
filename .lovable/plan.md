# Trilho PIX Automático Woovi: 2 furos de cancelamento + 1 lacuna

Reli o fluxo inteiro (checkout composto → webhook → ativação → ciclos → recuperação silenciosa → oferta → encerramento → cancelamento pelo portal) e confirmei que a espinha está no ar e coerente:

- `pix_gateway = woovi` e `pix_rail_status` saudável (checado agora, HTTP 200).
- Crons ativos: `woovi-pix-audit` a cada 15 min e `execute-scheduled-tasks` a cada 5 min.
- Webhook: claim idempotente, confirmação do pagamento na API antes de liberar acesso, criação de perfil na venda nova, welcome (WhatsApp + email + portal), Purchase no Meta CAPI e cancelamento da cadência quando o dinheiro entra.
- Recuperação silenciosa: retry oportunista → CobR do ciclo seguinte dentro da janela do Bacen → oferta em D+8 → Lite em +3 → encerramento em +4, com guarda de "já pagou" em cada passo e backstop na auditoria.
- Oferta aceita gera mandato NOVO no valor da oferta via `/reautorizar-pix` (roteador → `criar-pix-recorrente-woovi` em `mode=offer`).

O que está furado é justamente o **cancelamento do mandato**, em dois lugares, cada um usando um verbo/rota diferente. Testei os três endpoints que o código usa:

| Chamada usada no código | Onde | Resposta da Woovi |
| --- | --- | --- |
| `PUT /api/v1/subscriptions/{id}/cancel` | `woovi-pix-audit` | 401 (rota válida, só faltou credencial) |
| `POST /api/v1/subscriptions/{id}/cancel` | `cancel-subscription` | 405 Method Not Allowed |
| `DELETE /api/v1/subscriptions/{id}` | `woovi_recovery_final` | 405 Method Not Allowed |

## 1. Cancelamento pelo portal nunca funciona (crítico, afeta cliente pagante)
`cancel-subscription` cancela com POST, a Woovi devolve 405 e o código trata `!resp.ok` como falha total: o cliente que clica em cancelar recebe "Não consegui cancelar o débito automático agora, fale com o suporte" **sempre**. No trilho Woovi ninguém consegue cancelar sozinho hoje — e o mandato segue debitando.

Correção: trocar para `PUT .../cancel`, o mesmo verbo que a auditoria já usa e que a API aceita.

## 2. Encerramento da recuperação não mata o mandato (crítico, risco de cobrança fantasma)
Em `woovi_recovery_final` o encerramento usa `DELETE /subscriptions/{id}` (405), com `.catch(() => null)` e **sem checar o retorno**. O mandato continua vivo na Woovi, mas localmente vira `CANCELADA` — e, como a auditoria só varre mandatos em status ativo, ele sai do radar. Se a Woovi debitar um ciclo depois disso, o dinheiro entra sem contrato do nosso lado.

Correção: usar `PUT .../cancel`, checar `ok`, e só marcar `CANCELADA` quando a Woovi confirmar; se recusar, gravar `last_error` e manter o status ativo para a auditoria reencontrar.

## 3. Encerramento morre se o perfil não tiver telefone
`PHONELESS_TASK_TYPES` cobre `woovi_cycle_recycle` e `woovi_next_cycle_cobr`, mas **não** `woovi_recovery_final` — que não fala com o cliente, só cancela o mandato e fecha o perfil. Sem telefone a tarefa vira `failed` e o mandato fica vivo indefinidamente.

Correção: incluir `woovi_recovery_final` na lista de tarefas técnicas.

## Detalhes técnicos
- `supabase/functions/cancel-subscription/index.ts`: método `PUT` no cancelamento Woovi (bloco `action === "cancel"`).
- `supabase/functions/execute-scheduled-tasks/index.ts`: `woovi_recovery_final` passa a usar `PUT /api/v1/subscriptions/{id}/cancel`, checa `ok` e só então atualiza `woovi_subscriptions.status` e `profiles.status`; `PHONELESS_TASK_TYPES` ganha `woovi_recovery_final`.
- Sem migração e sem mudança de estratégia: régua de ~37 dias, silêncio total e escada 30% off → Lite → encerramento ficam como estão.
- Depois: redeploy de `cancel-subscription` e `execute-scheduled-tasks` e um `dry_run` da `woovi-pix-audit` para confirmar que nada regrediu.

Fora isso não achei outro ponto que impeça o fluxo de rodar 100%: QR composto, conclusão parcial por banco, replay de webhook perdido, churn silencioso com 30% off e backstop de ciclo sem cobrança estão implementados e com guardas.