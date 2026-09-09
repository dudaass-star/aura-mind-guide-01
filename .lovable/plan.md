# Clientes que passaram do 8º dia sem a mensalidade cobrada

## O que a checagem mostrou

Existem **10 clientes** com PIX Automático (entrada de R$ 6,90 paga, autorização viva) que já passaram do 8º dia e **não têm nenhuma mensalidade registrada como paga**:

| Cliente | Plano | 8º dia | Situação da tentativa |
|---|---|---|---|
| Paula Cristina Barbosa da Silva | Direção | 19/08 | ordem criada, sem veredito |
| Eliana Regina | Essencial | 21/08 | tentativa sem resposta |
| Carlos | Essencial | 23/08 | recusada ("parcela já tem cobrança") |
| Maria da Luz Gonçalves | Essencial | 23/08 | tentativa apontou parcela de 23/09 (data errada) |
| Ivandelmo Dias de Siqueira | Essencial | 23/08 | tentativa sem resposta |
| Fabio Alves | Essencial | 30/08 | tentativa sem resposta |
| Cleide Regina Pereira Matias | Transformação | 02/09 | recusada ("parcela já tem cobrança") |
| Álida Rejane da Silva Carvalho | Essencial | 08/09 | recusada ("parcela já tem cobrança") |
| Hélida Regina Marques Beraldo | Direção | 08/09 | recusada ("parcela já tem cobrança") |
| Carla Cristina de Souza | Direção | 08/09 | recusada ("parcela já tem cobrança") |

Dois pontos importantes:

1. A recusa "a parcela já tem cobrança" significa que a ordem de débito **já existe no banco** — pode ter sido paga e nós não registramos. Como a parcela do carnê não chega por webhook, esse dinheiro só aparece conferindo o extrato. Ou seja: parte desses 10 pode já ter pagado.
2. Cleide segue com acesso liberado até 07/10 sem mensalidade paga. Os outros já estão com o prazo de acesso vencido.

## O que fazer

1. **Conferir o extrato antes de qualquer cobrança nova.** Rodar a varredura de extrato da auditoria em modo somente leitura e cruzar cada um dos 10 com os pagamentos recebidos. Quem já pagou é apenas registrado (mensalidade paga + acesso renovado), sem cobrar de novo.
2. **Cobrar de verdade quem não pagou.** Para os restantes, garantir uma ordem de débito na parcela vencida correta (nunca em parcela futura) e agendar a reconferência do veredito no dia seguinte.
3. **Corrigir a causa raiz das recusas.** Hoje "a parcela já tem cobrança" é tratado como falha e o cliente sai do radar. Passa a ser tratado como "ordem existe" → conferir extrato/veredito em vez de marcar erro.
4. **Corrigir tentativa sem veredito.** Tentativas que ficam sem resposta precisam de reconferência obrigatória em 24h; hoje algumas ficaram paradas para sempre.
5. **Alinhar acesso e pagamento.** Quem passou do 8º dia sem mensalidade paga não deve continuar com acesso estendido: acesso passa a acompanhar a última mensalidade efetivamente paga (caso da Cleide).
6. **Régua de cobrança.** Quem realmente não pagou entra na régua já existente (nova tentativa e, na sequência, oferta de recuperação), sem mensagem duplicada para quem o extrato mostrar como pago.

## Detalhes técnicos

- Diagnóstico: `woovi_subscriptions` (status ATIVA/APROVADA + `entry_paid_at`) sem linha `kind='cycle'` com `status='COMPLETED'` em `woovi_charges`, com `start_date + 7 < hoje`.
- Varredura de extrato: `woovi-pix-audit` com `{ only: "extrato", summary_only: true }` primeiro (leitura), depois conciliação.
- `retryInstallmentCobr` / tratamento de resposta em `_shared/woovi.ts`: mapear `400 "A parcela já tem cobr"` para um status novo `COBR_ALREADY_EXISTS` que agenda `woovi_retry_confirm` em 24h, em vez de `RETRY_REJECTED_400`.
- `RETRY_REQUESTED` sem veredito passa a sempre gerar `woovi_retry_confirm` (limite de 11 dias já aplicado).
- Reforçar `findUnpaidInstallment` no caso Maria da Luz (parcela 23/09 selecionada indevidamente) e invalidar a tentativa errada.
- Acesso: `profiles.plan_expires_at` derivado da última `woovi_charges` de ciclo paga.
- Nenhuma migração de gateway, nenhum alerta para admin.
