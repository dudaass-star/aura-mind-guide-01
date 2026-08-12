# Verificar e corrigir o trilho PIX Woovi: ativação + welcome

## Resumo honesto

**Não está tudo certo.** O código do `webhook-woovi` está corretamente conectado
para ativar a assinatura e disparar o welcome da Aura quando o PIX é pago — mas
**nenhum pagamento Woovi foi concluído com sucesso em produção até hoje**. A
evidência:

- `woovi_charges` está **vazia** (zero linhas) — o ramo `chargePaid` do webhook,
  que libera acesso + manda welcome, **nunca executou**.
- Todas as 7 assinaturas Woovi recentes estão em `AGUARDANDO`/`CREATED`,
  com `entry_paid_at`, `mandate_approved_at`, `access_granted_at` e `user_id`
  **todos nulos**. Ninguém recebeu acesso nem welcome.
- `woovi_webhook_events` só tem **2 registros**, ambos mandatos `REJECTED`
  (tentativas de teste rejeitadas pelo banco). **Zero** eventos de mandato
  `APPROVED` e **zero** eventos de cobrança paga.

Ou seja: o QR é gerado, mas o caminho de sucesso (pagar → ativar → welcome)
nunca foi exercitado. Não posso confirmar que funciona.

## Suspeita (não confirmada)

Inspecionei os 2 payloads reais que a Woovi enviou (mandatos REJECTED). O
envelope é **plano no topo do corpo** — `correlationID`, `globalID`, `status`,
`value`, `pixRecurring` todos no nível raiz, **sem** um objeto `body.charge` nem
`body.subscription`.

O `webhook-woovi` (linhas 510-599) faz:
```
const charge = (body.charge || {})   //  ← vazio se a Woovi manda plano
const subPayload = (body.subscription || {})  //  ← vazio
```

Para **mandatos** isso funciona, porque o código também lê `body.pixRecurring`
e casa por `recurrency_id`. Mas para **cobrança paga**, a ativação exige
`chargeId = charge.correlationID || charge.globalID || charge.identifier` — se
`body.charge` for vazio, `chargeId` é `undefined` e **todo o ramo de ativação é
pulado**, mesmo que o evento chegue. O mandato REJECTED casou por
`pixRecurring.recurrencyId`; um eventual `CHARGE_COMPLETED` pode estar chegando
e sendo silenciosamente ignorado.

**Não posso confirmar isso sem capturar um payload real de cobrança paga** —
pode ser que a Woovi use envelopes diferentes por tipo de evento. O plano
trata isso como hipótese a verificar, não como causa certa.

## Plano

### Passo 1 — Confirmar o tamanho real do problema (leitura, sem edit)
- Confirmar se `webhook-woovi` está deployado e acessível externamente
  (ver `supabase/config.toml`; checar se `verify_jwt = false`).
- Rodar a auditoria `woovi-pix-audit` em `dry_run` para ver quantas
  assinaturas compostas estão em estado parcial/abandonadas e se o replay
  encontra cobranças pagas na Woovi sem `paid_at` local.

### Passo 2 — Capturar um payload real de cobrança paga (teste ponta a ponta)
- Fazer um pagamento real de teste (R$ 6,90 do trial) ponta a ponta, ou acionar
  manualmente uma cobrança de entrada na Woovi e observar o webhook.
- Registrar o payload cru que chega em `webhook-woovi` (já há
  `console.log("[webhook-woovi] recebido:", ...)` na linha 507) e conferir se
  `body.charge` vem populado ou se os campos estão no topo do corpo.
- Decisão: se `body.charge` vier vazio, confirmamos a suspeita do Passo 2
  como causa raiz. Se vier populado, a causa é outra (webhook não registrado
  para eventos de cobrança, ou nenhum pagamento real concluído ainda).

### Passo 3 — Corrigir o parsing do webhook (se confirmado)
- Se a Woovi envia cobrança no topo do corpo, normalizar o parsing em
  `webhook-woovi/index.ts` para ler `charge` de `body.charge || body` (plano),
  garantindo que `chargeId`, `charge.status`, `charge.value`,
  `charge.correlationID` sejam extraídos do envelope real.
- Manter o ramo de mandato intacto (já funciona via `pixRecurring`).
- Re-deploy do `webhook-woovi`.

### Passo 4 — Reconciliação retroativa + teste final
- Rodar `woovi-pix-audit` (agora sem dry_run) para replay de cobranças pagas
  que ficaram órfãs — o replay já reenvia para `webhook-woovi`, que com o
  parsing corrigido deve ativar o acesso e disparar o welcome.
- Confirmar ponta a ponta: uma assinatura paga → `woovi_charges` preenchida,
  `access_granted_at` setado, `profiles.status = active`, welcome WhatsApp
  enviado, welcome email enviado, Meta CAPI Purchase disparado.

## Fora de escopo
- Não mexer no fluxo de dunning (D+2/D+4/D+7) — só entra em ação depois que o
  ciclo 1 já pagou, e nada pagou ainda.
- Não alterar o `criar-pix-recorrente-woovi` (criação do QR funciona: todas as
  assinaturas chegam a `creation_status: completed`).
