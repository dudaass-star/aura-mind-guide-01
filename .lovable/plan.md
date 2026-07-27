## Diagnóstico confirmado

**1. Lite e Base não chegaram** — não é bug de backend. Os 3 disparos saíram com `sent=true`, mas na Twilio:

| Oferta | Status | Erro |
|---|---|---|
| 30% off | delivered | — |
| Lite R$19,90 | failed | `63013` |
| Base R$9,90 | undelivered | `63016` |

Exatamente o esperado para templates ainda pendentes de aprovação no Meta. Assim que aprovarem, os envios funcionam sem mudança de código.

**2. O link com erro não tem relação com o plano Direção.** O `cancel-subscription` resolve o token, acha o perfil, e depois procura assinatura **no gateway**: Stripe `active` → Stripe `past_due` → Asaas. Seu e-mail não tem nenhuma delas (o `active`/`direcao` existe só no banco), então retorna `{"success": false, "message": "Nenhuma assinatura ativa encontrada"}` e a tela cai no estado de erro. Confirmei chamando a edge direto com seu token.

Para um inadimplente real o fluxo funciona (ele tem subscription em `past_due`/`OVERDUE`). Mas há dois buracos reais que valem fechar.

## O que fazer

### 1. Blindar a aterrissagem da oferta
`supabase/functions/cancel-subscription/index.ts` + `src/pages/CancelSubscription.tsx`:
- Quando a entrada é por **token de dunning com `offer=`** e não há assinatura no gateway, parar de devolver erro genérico. Devolver `status: "no_gateway_subscription"` e, no front, mostrar a oferta prometida como **reativação**: card do tier oferecido com CTA para o checkout no preço da oferta (Lite R$19,90 / Base R$9,90 / mensal com 30% off), preservando o token.
- Cobrir também `canceling`/`paused`/Asaas `OVERDUE` nesse caminho por token, para ninguém receber a mensagem e bater em parede.
- Erro cru só quando o token for inválido/expirado, aí com CTA pro WhatsApp de suporte.

### 2. Registrar falha de entrega (hoje é cega)
`supabase/functions/_shared/dunning-whatsapp.ts` + `webhook-twilio-recovery`:
- A Twilio aceita o POST (`queued`) e só depois marca `failed`/`undelivered` — por isso o log gravou "enviado" para mensagens que nunca chegaram. Passar a gravar o `error_code` no `dunning_attempts` via callback de status e marcar `whatsapp_sent = false` quando o status final for `failed`/`undelivered`.
- Tratar `63013 / 63016 / 63005` como **degrau não entregue**: não queimar a cota do ciclo, para o usuário não perder o degrau por causa de template pendente.

Sem fallback para template genérico — se o degrau não entregar, ele simplesmente não conta e é reofertado depois.

### 3. Reteste
Reenfileirar os 3 disparos para o seu número, conferir status real de entrega na Twilio via `test-recovery-template` e abrir cada link para validar o destino.

## Detalhes técnicos
- Arquivos: `supabase/functions/cancel-subscription/index.ts`, `supabase/functions/_shared/dunning-whatsapp.ts`, `supabase/functions/webhook-twilio-recovery/index.ts`, `src/pages/CancelSubscription.tsx`.
- Sem migração: `dunning_attempts` já tem `error_stage`/`error_message`/`message_sid` para casar o callback.
- Nada muda nos ContentSids — eles passam a funcionar sozinhos quando o Meta aprovar.
