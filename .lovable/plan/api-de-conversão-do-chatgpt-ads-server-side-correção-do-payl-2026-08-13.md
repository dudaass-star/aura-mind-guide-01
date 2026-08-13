# API de Conversão do ChatGPT Ads (server-side) + correção do payload do pixel

## Objetivo
Hoje só temos o pixel no navegador (`oaiq`). Ele perde eventos por bloqueadores, e a compra real acontece nos webhooks (Stripe/Woovi/Inter/Asaas). Vamos espelhar o que já fazemos com o Meta: enviar os eventos também pelo servidor, com o mesmo `event_id` para não duplicar.

## O que muda

### 1. Corrigir o `type` dos eventos no pixel
A documentação da OpenAI usa `type: "contents"` para eventos de funil (`checkout_started`, `purchase`). Hoje enviamos `customer_action` em tudo.
- `page_view` continua `customer_action`
- `checkout_started` e `purchase` passam a usar `contents`

### 2. Nova função de servidor `openai-capi`
Recebe evento e repassa para `https://bzr.openai.com/v1/events?pid=4DosRHCmjrnJkM9nitjuu5` com `Authorization: Bearer <chave>`, no formato do payload documentado (`id`, `type`, `timestamp_ms`, `source_url`, `action_source: "web"`, `data`). Falha nunca quebra o fluxo de pagamento (try/catch + log).
- A chave de API será pedida como secret (`OPENAI_ADS_API_KEY`) — sem ela a função apenas registra e sai.

### 3. Disparo nos webhooks de pagamento
Nos mesmos pontos onde já chamamos o `meta-capi` com `Purchase`, chamamos também o `openai-capi` com `purchase`, reusando o **mesmo `event_id`** já usado hoje (ex.: `session.id + '_purchase'`), para deduplicar com o evento do navegador:
- `stripe-webhook` (cartão)
- `webhook-woovi` (PIX automático)
- `webhook-inter`
- `webhook-asaas`

### 4. Dedupe navegador ↔ servidor
O pixel passa a enviar um `event_id` estável no `purchase` e `checkout_started` (mesma lógica de `event_id` que já usamos no Meta), garantindo que os dois canais contem uma venda só.

## Detalhes técnicos
- Nova edge function `supabase/functions/openai-capi/index.ts` (`verify_jwt = false`, chamada via `invoke`/fetch interno com service key), seguindo o padrão do `meta-capi`.
- `src/lib/openai-pixel.ts`: `oaiqMeasure(name, payload, { type })`, novos helpers `oaiqCheckoutStarted` e `oaiqPurchase` com `event_id`.
- Chamadas nos webhooks em blocos `try/catch` isolados, sem bloquear a ativação da assinatura.
- Logs em PT-BR, timestamps em BRT.

## Pendência
Preciso da chave de API do ChatGPT Ads para o envio server-side funcionar; vou solicitá-la como secret na implementação.
