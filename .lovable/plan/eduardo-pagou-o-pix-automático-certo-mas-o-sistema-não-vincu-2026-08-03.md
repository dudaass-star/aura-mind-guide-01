# Eduardo: pagou o PIX Automático certo, mas o sistema não vinculou

## Resposta direta: ele NÃO pagou um PIX avulso

Ele pagou exatamente o QR do PIX Automático Bacen que a gente mostra no checkout.

O fluxo que usamos é a Jornada 3 (`immediateQrCode` na autorização): um único QR faz **o 1º pagamento + o consentimento de recorrência**. O que confirmamos na conta Asaas:

- Autorização `d865ea5a…` criada 02/08 11:31 BRT e **ativada 11:32 BRT** — ou seja, ele completou o consentimento no app do banco.
- O 1º pagamento entrou como cobrança `pay_0ibxcnle80mcyiku`, `RECEIVED` em 02/08, R$ 29,90, com descrição gerada pelo próprio Asaas: "Cobrança gerada automaticamente a partir de Pix recebido".
- Essa cobrança vem **sem `subscription` e sem `pixAutomaticAuthorizationId`** — só com `customer`. É assim que o Asaas contabiliza o pagamento imediato do QR integrado.
- A assinatura `sub_tca2rgb0ht3wan8x` está `ACTIVE` no Asaas, com as duas faturas gêmeas `PENDING` de ciclo 1 (o caso já conhecido de `startDate = hoje`).

Então "PIX avulso" aqui é só o rótulo que o Asaas dá ao pagamento imediato do próprio QR Bacen. Não existe caminho no checkout que ofereça PIX comum para esse plano.

## Por que a correção anterior não pegou

A correção que fizemos criou o fallback por `customer` no `webhook-asaas`, mas com uma condição rígida: só reconcilia se existir autorização com `status = 'ACTIVE'`.

No QR integrado a ordem dos eventos é: **pagamento recebido primeiro, ativação da autorização depois** (mesmo minuto, 11:32). Quando o `PAYMENT_RECEIVED` chegou, nossa linha em `asaas_pix_authorizations` ainda estava `PENDING` → o fallback foi ignorado, o pagamento nunca virou linha em `asaas_payments` e a ativação não rodou. Como não há reprocessamento, ele ficou parado ali:

- sem `profiles`, sem token do portal, sem WhatsApp de boas-vindas, sem e-mail de confirmação;
- e entrou no fluxo de carrinho abandonado (e-mail 02/08, WhatsApp 03/08) mesmo tendo pago;
- em 03/08 13:19 UTC a autorização Bacen foi cancelada, então o próximo ciclo não debitaria sozinho.

A auditoria diária também não salvou porque ela olha as autorizações e faturas que já conhecemos — nunca compara com os pagamentos que existem no Asaas e não existem na nossa base.

## Correções

1. **Fallback por customer sem depender de `ACTIVE`** (`webhook-asaas`, bloco ~linha 372): aceitar autorização recente do mesmo `customer` em qualquer status (`PENDING`, `ACTIVE`, `CANCELLED`, `EXPIRED`), mantendo a tolerância de valor de R$ 0,50 e uma janela de 30 dias. Pagamento confirmado nunca pode ser descartado por causa do estado momentâneo do consentimento.
2. **Reprocessamento na ativação da autorização**: ao receber `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED`, procurar no Asaas pagamentos `RECEIVED`/`CONFIRMED` recentes do mesmo customer que não estejam em `asaas_payments` e reconciliar na hora — fecha a corrida de ordem de eventos.
3. **Reconciliação ativa na auditoria** (`asaas-pix-auto-audit`): consultar os pagamentos `RECEIVED`/`CONFIRMED` dos últimos 5 dias no Asaas e criar/ativar qualquer um que falte na base, com alerta ao admin. Rede de segurança para qualquer webhook perdido, não só PIX Automático.
4. **Não recuperar quem pagou**: antes de disparar recuperação de checkout (e-mail e WhatsApp), verificar se existe pagamento pago no Asaas/Stripe para o mesmo e-mail/telefone; se existir, encerrar a sessão de checkout.

## Ação imediata para o Eduardo

1. Registrar `pay_0ibxcnle80mcyiku` e rodar a ativação: perfil `active`, acesso até 02/09, token do portal, WhatsApp de boas-vindas e e-mail de confirmação.
2. Cancelar as duas faturas gêmeas `PENDING` para ele não ser cobrado de novo.
3. Encerrar o fluxo de recuperação de carrinho dele.
4. Como o consentimento Bacen foi cancelado em 03/08, avisar antes de 02/09 para ele reautorizar o PIX Automático (ou trocar para cartão), senão a renovação não debita.

## Detalhes técnicos

- Arquivos: `supabase/functions/webhook-asaas/index.ts` (fallback por customer + handler de `AUTHORIZATION_ACTIVATED`), `supabase/functions/asaas-pix-auto-audit/index.ts` (novo passo `GET /v3/payments?status=RECEIVED&paymentDate[ge]=…`), funções de recuperação de checkout (guarda de pagamento).
- Idempotência garantida por `UNIQUE (asaas_payment_id)`; a ativação reaproveita `handleActivation`.
- Memória a atualizar: a reconciliação por customer não exige autorização `ACTIVE`, e o pagamento imediato do QR integrado sempre chega como cobrança sem `subscription`.
