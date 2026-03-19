

# Correção dos Eventos Meta Pixel/CAPI

## Situação Atual

O fluxo de trial agora vai direto para `/checkout` (Stripe), não usa mais o `start-trial` edge function. O mapa de eventos atual:

| Evento | Client (Pixel) | Server (CAPI) | Problema |
|--------|----------------|---------------|----------|
| PageView | ✅ index.html | ❌ | OK para topo de funil |
| InitiateCheckout | ✅ Checkout.tsx | ❌ | Sem CAPI — ad-blockers perdem o evento |
| Purchase | ✅ ThankYou.tsx (sem value) | ✅ stripe-webhook (com value) | **Sem event_id compartilhado = duplicação no Meta** |
| Lead | ❌ | ✅ start-trial (legado, não usado mais) | **Evento morto — nunca dispara** |
| ViewContent | ❌ | ❌ | **Missing — Meta não otimiza topo de funil** |

## Plano de Correção

### 1. Remover evento Lead do `start-trial`
O `start-trial` não é mais usado no fluxo principal. O evento Lead server-side é código morto.

### 2. Adicionar ViewContent na landing page (`Index.tsx`)
Disparar `fbq('track', 'ViewContent')` quando o usuário visita a página principal — permite ao Meta otimizar campanhas de awareness.

### 3. Deduplicar Purchase com `event_id`
- **Checkout.tsx**: gerar um `event_id` único (UUID) antes de redirecionar ao Stripe, salvar no `localStorage` junto com os dados do checkout
- **ThankYou.tsx**: ler o `event_id` do localStorage e enviar no `fbq('track', 'Purchase', {...}, {eventID: id})`
- **create-checkout**: passar o `event_id` no metadata da session Stripe
- **stripe-webhook**: ler o `event_id` do metadata e enviar no CAPI Purchase

### 4. Adicionar `value` no Purchase client-side (`ThankYou.tsx`)
Ler plano/billing do localStorage e incluir o valor correspondente no evento Purchase do Pixel.

### 5. Adicionar InitiateCheckout server-side (CAPI)
No `create-checkout`, após criar a session Stripe, enviar um evento `InitiateCheckout` via meta-capi com os dados do usuário — garante tracking mesmo com ad-blockers.

## Arquivos Alterados
- `src/pages/Index.tsx` — ViewContent pixel event
- `src/pages/Checkout.tsx` — gerar event_id, salvar no localStorage
- `src/pages/ThankYou.tsx` — Purchase com event_id + value
- `supabase/functions/create-checkout/index.ts` — event_id no metadata + CAPI InitiateCheckout
- `supabase/functions/stripe-webhook/index.ts` — event_id no CAPI Purchase

