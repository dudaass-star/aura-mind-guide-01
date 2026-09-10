# Correção do fluxo de reautorização PIX (3 defeitos)

A investigação mostrou que o fluxo existe e funciona na maioria dos casos (9 pedidos de nova autorização enviados e entregues nos últimos dois dias). Mas há três defeitos reais que deixam clientes sem aviso e um loop de reenvio. Este plano corrige os três e cuida dos dois casos pendentes hoje.

## 1. Autorização vencida no meio da régua de cobrança (caso Marcia)

Hoje: quando a autorização morre depois de a cobrança já ter entrado na régua normal, o cliente recebe conversa agendada para dias depois do acesso cair, e uma conversa pendente impede a criação do pedido urgente.

Correção:
- Pedido de nova autorização passa a ter prioridade sobre a conversa de cobrança: ao detectar autorização morta, as tarefas de cobrança pendentes daquela assinatura são encerradas e o pedido de reautorização é criado na hora.
- Conversa em andamento não bloqueia mais o pedido urgente quando o acesso expira em 2 dias ou menos.

## 2. Quem já está marcado como recusado sai do radar (caso Rosane)

Hoje: a auditoria só olha assinaturas ainda vivas, então quem tem a autorização recusada pelo banco deixa de ser auditado antes de receber qualquer aviso — 209 assinaturas inativas nunca tiveram esse aviso registrado.

Correção:
- Nova varredura de assinaturas recusadas/canceladas que tiveram entrada paga, ainda estão dentro (ou logo após) do acesso e nunca foram avisadas, criando o pedido de nova autorização com deduplicação.
- Limitada a quem pagou de verdade e aos últimos 30 dias, para não reabrir conversa antiga com quem nunca entrou.

## 3. Falha de entrega em reenvio infinito

Hoje: três números (Vitória Benevides, Taty Costa, Eliane Ferreira) recebem nova tentativa todo dia ao meio-dia porque a falha de "número sem WhatsApp" não encerra a tarefa.

Correção:
- Falha permanente de número (código 63024 e equivalentes) encerra a tarefa após a primeira ocorrência, com o motivo registrado.
- Falhas temporárias (rede, limite do provedor) continuam com nova tentativa como hoje.

## 4. Os dois casos de hoje

- Marcia e Rosane entram na fila agora, com pedido de nova autorização enviado hoje, antes de o acesso cair em 11/09.
- Os três números com falha permanente são marcados para parar as tentativas.

## Detalhes técnicos

- `woovi-pix-audit/index.ts`: no bloco de mandato morto, cancelar `scheduled_tasks` pendentes de ciclo (`woovi_cycle_recycle`, `woovi_next_cycle_cobr`) da assinatura antes de criar a oferta; remover o bloqueio por conversa pendente quando o fim de acesso está a ≤ 2 dias; nova varredura sobre `woovi_subscriptions` com status recusado/cancelado, `entry_paid_at` não nulo, `reauth_notified_at` nulo e janela de 30 dias, gravando `reauth_notified_at` ao criar a tarefa (dedupe por `subscription_id`).
- `execute-scheduled-tasks/index.ts`: classificar erro Twilio 63024 (e códigos de destinatário inválido) como permanente → `status = 'failed'` definitivo com `last_error`, sem reagendar; manter retry para 429/5xx.
- Rodar `woovi-pix-audit` em `dry_run` primeiro, revisar a lista, e só então executar de verdade.
- Sem migração de banco. Deploy de `woovi-pix-audit` e `execute-scheduled-tasks`.
- Nada de aviso a admin nem tela nova; correção direta no fluxo.
