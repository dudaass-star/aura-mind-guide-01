# Revisão: ninguém está sem cobrança do mensal?

## O que a conferência de agora mostrou (só leitura)

77 clientes com PIX Automático vivo e entrada paga:

- **68** ainda não chegaram na data do mensal (vencem de 10/09 em diante) — nada a fazer.
- **9** já passaram da data e ainda não têm mensalidade paga.

Os 9 casos, um por um:

| Cliente | Plano | Venceu | Situação agora |
|---|---|---|---|
| Eliana Regina | Essencial | 21/08 | ordem de débito pedida hoje (parcela de 22/08, a correta) |
| Maria da Luz Gonçalves | Essencial | 23/08 | ordem pedida hoje na parcela de 23/08 (antes apontava 23/09 — corrigido) |
| Ivandelmo Dias de Siqueira | Essencial | 23/08 | ordem pedida hoje, conferência amanhã |
| Carlos | Essencial | 23/08 | ordem pedida hoje, conferência amanhã |
| Fabio Alves | Essencial | 30/08 | ordem pedida hoje, conferência amanhã |
| Carla Cristina de Souza | Direção | 08/09 | banco respondeu "já existe ordem" → conferência amanhã |
| Álida Rejane da Silva Carvalho | Essencial | 08/09 | ordem pedida hoje, conferência amanhã |
| Gisele Pavan | Essencial | 09/09 | ordem pedida hoje na parcela de 09/09 (antes ia pra 2027 — corrigido) |
| Regina Coeli Gomes de Souza | Direção | 09/09 | ordem pedida hoje na parcela de 09/09 (corrigido) |

Ou seja: **não há ninguém esquecido**. Todos os 9 têm ordem de débito na parcela certa e reconferência de resultado agendada para amanhã, mais a régua de recuperação já marcada para quem não pagar.

Sobre acesso: nenhum dos 9 está usando a Aura de graça — a validade de todos já venceu. E entre todos os clientes de PIX com acesso aberto hoje, todos estão dentro dos 8 dias pagos da entrada ou com mensalidade em dia.

As correções da semana funcionaram: das 3 marcas de "parcela errada" (2027), nenhuma sobrou ativa; as tentativas de hoje saíram todas na parcela vencida correta.

## O que ainda não está 100%

Duas frestas pequenas, nenhuma causando prejuízo hoje:

1. **Entradas sem dono registrado.** 115 pagamentos de entrada foram gravados sem o vínculo com o cliente (só com o mandato). A regra que impede acesso maior do que o pago procura por cliente, então nesses casos ela simplesmente não roda — hoje sem efeito prático, mas é um ponto cego.
2. **Cobranças antigas (21/08 a 30/08).** Cinco pessoas estão há 2–3 semanas sem pagar. Enquanto a autorização estiver viva, dá para tentar o débito indefinidamente — o teto é nossa escolha. A sugestão é tentar com folga entre tentativas até 30 dias após o vencimento e, depois disso, o caso vira só recuperação por conversa (a régua já existente), para não virar notificação diária no banco do cliente.

## Proposta (curta)

1. Preencher o dono dos pagamentos de entrada antigos e passar a gravar sempre esse vínculo, para a regra de acesso enxergar todo mundo.
2. Teto de tentativa de débito por ciclo: 30 dias após o vencimento, com intervalo mínimo de 3 dias entre tentativas (evita encher o app do banco do cliente). Passado o teto, sai da fila de débito e fica só na régua de recuperação.
3. Amanhã, depois da reconferência, uma nova leitura desses 9 para confirmar quantos pagaram — sem mexer em código.

## Detalhes técnicos

- Verificação feita em `woovi_subscriptions` (vivos: `ATIVA`/`APROVADA`, `entry_paid_at` não nulo, sem `replaced_by_subscription_id`) cruzada com `woovi_charges` (`kind='cycle'`, `paid_at`) e `scheduled_tasks` (`woovi_retry_confirm`, `woovi_recovery_offer/final`).
- Item 1: backfill de `woovi_charges.user_id` a partir de `woovi_subscriptions.user_id` via `subscription_id`, e gravação do campo em `webhook-woovi` no evento de entrada paga. `_shared/woovi-access.ts` passa a aceitar também o vínculo por mandato.
- Item 2: em `woovi-pix-audit` e `execute-scheduled-tasks`, não recriar/reconfirmar ordem de ciclo com vencimento acima de 15 dias; nesse caso só garantir a régua de recuperação e a CobR do ciclo seguinte.
- Sem migração de schema além do backfill; redeploy de `webhook-woovi`, `woovi-pix-audit` e `execute-scheduled-tasks`.
