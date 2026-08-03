# Eduardo: o consentimento Bacen funcionou — e depois ele mesmo cancelou

## Não há contradição entre as duas coisas

Os dois fatos são verdadeiros, em momentos diferentes:

- **02/08, 11:31 BRT** — QR integrado gerado (`originType: IMMEDIATE_PAYMENT_AND_RECURRING_QR_CODE`).
- **02/08, 11:32 BRT** — ele autorizou no app do banco: a autorização `d865ea5a…` ficou **ACTIVE** e o 1º pagamento de R$ 29,90 entrou como `RECEIVED`. Ou seja: pagou pelo caminho certo, com consentimento Bacen ativo.
- **03/08, 13:19 UTC** — a autorização virou **CANCELLED**, com `cancellationReason: REQUESTED_BY_PAYER_USER`. O cancelamento partiu do próprio pagador, no app do banco.

Então não existiu PIX avulso e não existiu falha de consentimento. Existiu consentimento válido + pagamento válido + cancelamento posterior feito por ele — um dia depois.

O motivo provável é o nosso próprio bug: como o pagamento não foi reconciliado (a corrida de eventos já corrigida), ele não recebeu confirmação, ainda recebeu e-mail/WhatsApp de carrinho abandonado e concluiu que a cobrança tinha sido indevida. Aí desfez a autorização no banco.

## O que isso deixa exposto no sistema

Quando o cliente derruba o consentimento no app do banco, hoje o webhook só marca a autorização como `CANCELLED` e o perfil como `canceled`. Ninguém é avisado — nem o cliente, nem o admin. O cliente segue com acesso até o fim do ciclo e, na renovação, o débito simplesmente não acontece.

No caso do Eduardo: perfil `active` com acesso até 03/09, mas sem consentimento ativo. Em 03/09 não debita nada.

## Correções propostas

1. **Alerta ao admin no cancelamento de consentimento**: no evento `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED`, enviar alerta com nome, e-mail, plano, motivo do cancelamento e data em que o acesso termina.
2. **Não marcar `canceled` cegamente quando o ciclo está pago**: se existe ciclo pago em aberto, manter o perfil `active` até `plan_expires_at` e registrar que o consentimento caiu, em vez de derrubar o status na hora.
3. **Outreach de reautorização, com QR só de consentimento**: 5 dias antes de `plan_expires_at`, se o consentimento não estiver `ACTIVE`, disparar e-mail (e WhatsApp, se a janela estiver aberta) com um link nosso — nada de link do banco.

   Não existe "link do banco": o Bacen não expõe URL de consentimento. Quem existe é o **QR Code de autorização**, que o cliente lê no app do banco dele e aprova ali. Hoje todo QR que geramos vem com `immediateQrCode`, ou seja, cobra na hora — usar isso na reautorização faria o Eduardo pagar de novo em cima de um ciclo já pago.

   Então a reautorização precisa de uma variação nova: autorização **sem `immediateQrCode`**, com `startDate` na data de renovação (03/09 no caso dele). O QR só cria o consentimento; a primeira cobrança sai no vencimento normal.

   O fluxo pro cliente: e-mail/WhatsApp → página `/reautorizar-pix?token=…` no nosso domínio → QR + copia-e-cola + polling do status (igual ao checkout) → "autorizado" na tela quando o `AUTHORIZATION_ACTIVATED` chegar. Alternativa na mesma página: trocar pra cartão.
4. **Métrica no admin**: contador de consentimentos PIX perdidos e quantos foram reautorizados, junto às métricas de saúde do PIX que já existem.

## Ação imediata pro Eduardo

- Confirmar com ele que o pagamento de 02/08 está reconhecido e o acesso vale até 03/09.
- Explicar que o cancelamento do consentimento saiu do app do banco dele e pedir a reautorização (ou oferecer cartão) antes de 03/09.

## Detalhes técnicos

- `supabase/functions/webhook-asaas/index.ts`, bloco de eventos de autorização (linhas ~107-145): separar `CANCELLED` de `REJECTED`/`EXPIRED`, consultar ciclo pago em `asaas_payments` antes de mexer no `status` do perfil, e emitir o alerta.
- Nova coluna `profiles.pix_consent_lost_at` (migração) para alimentar outreach e métrica.
- Outreach: passo novo em `asaas-pix-auto-audit` (diário), comparando `plan_expires_at` com o status da autorização.
- `criar-pix-recorrente-asaas`: novo modo `consentOnly` — omite `immediateQrCode` e usa `startDate` = data de renovação, mantendo `paymentCreationMode: SUBSCRIPTION` e `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS`. Confirmar na sandbox que a Asaas aceita autorização sem QR imediato antes de liberar em produção.
- Página nova `src/pages/ReautorizarPix.tsx` reaproveitando o componente de QR + polling do `CheckoutV2.tsx` e o `asaas-pix-auto-status` já existente; acesso por token, sem senha, no padrão do portal.
- Métrica: `admin-engagement-metrics` + card em `AdminEngagement.tsx`.