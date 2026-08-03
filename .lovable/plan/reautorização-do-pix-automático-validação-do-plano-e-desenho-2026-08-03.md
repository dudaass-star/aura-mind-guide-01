# Reautorização do PIX Automático — validação do plano e desenho correto

## O que a validação derrubou

Fui checar a API da Asaas antes de implementar. O plano anterior propunha uma "autorização só de consentimento" (sem cobrança imediata, com `startDate` na data de renovação). **Isso não existe.**

Na referência de `POST /v3/pix/automatic/authorizations`, o objeto `immediateQrCode` é marcado como **required**, e a doc de implementação diz explicitamente: a autorização só passa para `ACTIVE` **depois** que o pagamento imediato é confirmado. Não há Jornada 2 (QR só de consentimento) exposta na API, e não existe URL/link do banco para reativar um consentimento cancelado — o consentimento vive no app do banco do pagador e, uma vez `CANCELLED`, aquela autorização morre para sempre.

Conclusão: reautorizar = **criar uma nova autorização com novo QR**, e esse QR sempre cobra na hora.

## Desenho que funciona na prática

Se o QR de reautorização sempre cobra, então ele não pode ser enviado no meio de um ciclo já pago (senão o cliente paga duas vezes). A solução é **alinhar a reautorização com o vencimento**: o pagamento imediato do novo QR *é* a cobrança do próximo ciclo.

```text
consentimento cai (AUTHORIZATION_CANCELLED)
        ↓ acesso preservado até plan_expires_at
aviso "sua renovação automática caiu" (informativo, sem QR)
        ↓ D-2 do vencimento
e-mail/WhatsApp com link → /reautorizar-pix?token=...
        ↓ novo QR (Jornada 3) no valor do ciclo
cliente paga = ciclo novo pago + consentimento novo ACTIVE
        ↓ webhook estende plan_expires_at
volta a debitar sozinho nos ciclos seguintes
```

Ou seja: nada de "QR sem cobrança". O QR sai na virada, cobra o ciclo que venceria de qualquer forma, e reata a recorrência no mesmo escaneamento. Quem não quiser reautorizar tem, na mesma página, a opção de migrar para cartão.

## Etapas

1. **Preservar acesso no cancelamento de consentimento** — hoje o webhook marca `profiles.status = 'canceled'` direto (`webhook-asaas/index.ts`, linhas 133-145), sem olhar se o ciclo está pago. Passa a: se existe ciclo pago vigente, manter `active` até `plan_expires_at` e apenas registrar `pix_consent_lost_at`. `REJECTED`/`EXPIRED` continuam como hoje.
2. **Alerta ao admin** no `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED`: nome, e-mail, plano, motivo e data em que o acesso termina.
3. **Modo reautorização em `criar-pix-recorrente-asaas`** — reaproveita o `asaas_customer_id` e o plano/ciclo já contratados, gera nova autorização Jornada 3 (com `immediateQrCode`, `paymentCreationMode: SUBSCRIPTION`, `retryPolicy: ALLOW_THREE_IN_SEVEN_DAYS`, TTL 24h), sem passar por checkout novo nem pedir CPF de novo. Marca a autorização antiga como substituída.
4. **Página `/reautorizar-pix`** — acesso por token, QR + copia-e-cola + polling de status (mesmo padrão do `CheckoutV2.tsx` com `asaas-pix-auto-status`), estado de sucesso quando o `ACTIVE` chega, e alternativa "pagar com cartão".
5. **Outreach em dois tempos** dentro do `asaas-pix-auto-audit` (que já roda diário): aviso informativo assim que o consentimento cai, e o link com QR em D-2 do vencimento. Nunca gerar QR antes disso.
6. **Métrica no admin**: consentimentos perdidos vs. reautorizados, junto aos cards de saúde do PIX que já existem.

## Ação imediata pro Eduardo

Acesso vale até 03/09. Não faz sentido mandar QR agora (ele pagaria em cima de ciclo pago). O caminho é avisar que a renovação automática caiu e que em 01/09 ele recebe o link para reativar — ou migrar para cartão antes disso.

## Detalhes técnicos

- `webhook-asaas/index.ts`: separar `CANCELLED` de `REJECTED`/`EXPIRED`; consultar `asaas_payments` (ciclo pago vigente) antes de tocar em `profiles.status`; disparar alerta admin.
- Migração: `profiles.pix_consent_lost_at timestamptz` + `asaas_pix_authorizations.replaced_by_authorization_id text`.
- `criar-pix-recorrente-asaas/index.ts`: aceitar `mode: 'reauthorize'` com `userId`/token, derivando plano, ciclo e customer do perfil; manter todo o resto do fluxo Jornada 3 intacto.
- Nova `src/pages/ReautorizarPix.tsx` + rota em `App.tsx`; token resolvido por edge function service_role (padrão do portal).
- `asaas-pix-auto-audit/index.ts`: passo novo comparando `plan_expires_at` com o status da autorização, com dedupe por `retention_events`/log para não repetir envio.
- Antes de ligar em produção: teste em sandbox criando autorização de reautorização para um customer que já tem uma `CANCELLED`, confirmando que a Asaas aceita a segunda autorização para o mesmo `customerId`.
