

# Instalar Meta Pixel (Facebook Pixel)

## O que é
O Meta Pixel é um snippet JavaScript que rastreia eventos de conversão no site (pageview, lead, purchase) para otimizar campanhas no Meta Ads.

## Como funciona
1. Você me passa o **Pixel ID** (ex: `123456789012345`)
2. Eu instalo o script base no `index.html`
3. Configuro eventos de conversão nos pontos certos:
   - **PageView** — todas as páginas (automático)
   - **Lead** — quando alguém inicia o trial (`/experimentar` → submit)
   - **InitiateCheckout** — quando acessa `/checkout`
   - **Purchase** — na página `/obrigado` (ThankYou)

## Arquivos afetados
- `index.html` — script base do pixel no `<head>`
- `src/pages/StartTrial.tsx` — evento `fbq('track', 'Lead')` no submit
- `src/pages/Checkout.tsx` — evento `fbq('track', 'InitiateCheckout')`
- `src/pages/ThankYou.tsx` — evento `fbq('track', 'Purchase')`

## Sobre o Token
O **token de API de conversões** (CAPI) é para envio server-side. Posso implementar isso também via edge function para maior precisão, mas o pixel client-side já resolve a maioria dos casos.

## Próximo passo
Me manda o **Pixel ID** e, se quiser CAPI também, o **Access Token**. Instalo tudo em seguida.

