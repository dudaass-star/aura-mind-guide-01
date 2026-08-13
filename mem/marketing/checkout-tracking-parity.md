---
name: Paridade de tracking em toda forma de pagamento
description: Regra obrigatória — todo método de pagamento novo ou alterado no checkout deve disparar Lead/InitiateCheckout (Meta pixel + CAPI), GA4 e ChatGPT Ads pelo helper único, e Purchase no webhook do gateway.
type: constraint
---
**Regra:** sempre que adicionarmos, trocarmos ou ajustarmos uma forma de pagamento (cartão Stripe, cartão Asaas, PIX avulso, PIX Automático Woovi/Inter/Asaas, ou qualquer gateway futuro), o tracking tem que ser ajustado no mesmo passo. Sem exceção.

**Início de checkout (frontend):** `CheckoutV2.tsx` tem `fireCheckoutStartTracking(methodLabel)` como **fonte única de verdade** — dispara `Lead` + `InitiateCheckout` no pixel do Meta (com Advanced Matching manual e `eventID`), os mesmos eventos no CAPI (`meta-capi`, mesmo `event_id` para dedupe), `trackAddPaymentInfo` do GA4 e `oaiqCheckoutStarted` do ChatGPT Ads. Todo caminho de pagamento **deve** chamar essa função. Dedupe por `plano_ciclo_metodo` em `startTrackedRef`.

**Compra (backend):** cada webhook de gateway precisa do `Purchase` no Meta CAPI (regra de 1ª compra) + `sendOpenAiConversion`. Já existe em `stripe-webhook`, `webhook-woovi`, `webhook-inter`, `webhook-asaas`.

**Furo histórico (ago/2026):** quando o PIX virou padrão em 12/08, o caminho PIX não disparava `Lead`/`InitiateCheckout` — só o cartão disparava. Resultado: leads reais de anúncio (ex.: Fátima, 13/08, chegando pelo navegador in-app do Facebook) não geravam evento nenhum no Meta, e as campanhas ficaram sem sinal de "iniciar finalização de compra". Corrigido com o helper único.

**Checklist ao mexer em pagamento:**
1. O clique/abertura do método chama `fireCheckoutStartTracking`?
2. O webhook do gateway dispara `Purchase` (Meta) e conversão OpenAI?
3. `checkout_funnel_events` tem os passos do novo trilho (`*_modal_open`, `*_requested`, `*_abandoned`, `purchase_confirmed`)?
4. `CheckoutFunnelPanel.tsx` mostra o novo método?
