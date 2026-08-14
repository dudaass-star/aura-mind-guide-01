---
name: Paridade de tracking em toda forma de pagamento
description: Regra obrigatória — todo método de pagamento novo ou alterado no checkout deve disparar Lead/InitiateCheckout (Meta pixel + CAPI), GA4 e ChatGPT Ads pelo helper único, e Purchase no webhook do gateway.
type: constraint
---
**Regra:** sempre que adicionarmos, trocarmos ou ajustarmos uma forma de pagamento (cartão Stripe, cartão Asaas, PIX avulso, PIX Automático Woovi/Inter/Asaas, ou qualquer gateway futuro), o tracking tem que ser ajustado no mesmo passo. Sem exceção.

**Início de checkout (frontend):** `CheckoutV2.tsx` tem `fireCheckoutStartTracking(methodLabel)` como **fonte única de verdade** — dispara `Lead` + `InitiateCheckout` no pixel do Meta (com Advanced Matching manual e `eventID`), os mesmos eventos no CAPI (`meta-capi`, mesmo `event_id` para dedupe), `trackAddPaymentInfo` do GA4 e `oaiqCheckoutStarted` do ChatGPT Ads. Todo caminho de pagamento **deve** chamar essa função. Dedupe por `plano_ciclo_metodo` em `startTrackedRef`.

**Compra (backend):** cada webhook de gateway precisa de 4 coisas: `Purchase` no Meta CAPI (regra de 1ª compra — `isFirstPurchase` calculado por ausência de perfil anterior, nunca fixo em `true`), `sendOpenAiConversion`, `sendGa4Purchase` (`_shared/ga4-purchase.ts`) e o passo `purchase_confirmed` em `checkout_funnel_events`. Já existe em `stripe-webhook`, `webhook-woovi`, `webhook-inter`, `webhook-asaas`.

**Furo histórico (ago/2026):** quando o PIX virou padrão em 12/08, o caminho PIX não disparava `Lead`/`InitiateCheckout` — só o cartão disparava. Resultado: leads reais de anúncio (ex.: Fátima, 13/08, chegando pelo navegador in-app do Facebook) não geravam evento nenhum no Meta, e as campanhas ficaram sem sinal de "iniciar finalização de compra". Corrigido com o helper único.

**Checklist ao mexer em pagamento:**
1. O clique/abertura do método chama `fireCheckoutStartTracking`?
2. O webhook do gateway dispara `Purchase` (Meta) e conversão OpenAI?
3. `checkout_funnel_events` tem os passos do novo trilho (`*_modal_open`, `*_requested`, `*_abandoned`, `purchase_confirmed`)?
4. `CheckoutFunnelPanel.tsx` mostra o novo método?

**Regras de evento (ago/2026, varredura do pixel):**
- `Lead` está **aposentado** — o mesmo clique virava dois eventos. Só `InitiateCheckout`. `Checkout.tsx` (rota legada) não tem mais tracking do Meta.
- `ViewContent` vai **sem `value`** (landing e checkout): preço só em `InitiateCheckout`, `Purchase` e `Subscribe`, senão o Meta alerta "envie mais preços".
- Todo `ViewContent`/`PageView` passa pelos helpers de `src/lib/meta-pixel.ts` (navegador + CAPI com o mesmo `event_id`). Nunca `fbq` cru numa página.
- `ThankYou.tsx` não desliga `autoConfig` — isso matava a Correspondência Avançada Automática.
- `meta-capi` aceita `test_event_code` (body ou `META_TEST_EVENT_CODE`) para validar no "Testar eventos" sem sujar produção.

**external_id obrigatório (ago/2026, redução de CPA):**
- `src/lib/meta-pixel.ts` mantém o cookie `aura_eid` (1ª parte, 180 dias) e envia `external_id` no pixel (via `fbq('init', ...)`) e no CAPI — mesmo valor nos dois.
- No checkout o `external_id` vai como lista: `[telefone só dígitos, aura_eid]`. Os webhooks não precisam mudar: o `meta-capi` deriva `external_id` do telefone (ou e-mail) quando o campo não vem, então `Purchase`/`Subscribe` costuram com o `InitiateCheckout`.
- `meta-capi` também grava `fbp/fbc` no `meta_identity_cache` quando o evento traz e-mail/telefone (antes só os criadores de cobrança gravavam) — é o que eleva a cobertura de `fbc` no `Purchase`.
- `meta_capi_log.external_id_present` alimenta a coluna `external_id` na tabela de qualidade do sinal do `CheckoutFunnelPanel`.
- Landing V2 (`IndexV2.tsx`) e páginas legadas (`Index.tsx`, `Checkout.tsx`) não têm mais `fbq` cru nem preço no `ViewContent`.
