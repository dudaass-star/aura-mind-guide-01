

# Corrigir re-disparo do evento Purchase no Meta Pixel

## Problema
A página ThankYou.tsx dispara `fbq('track', 'Purchase')` toda vez que é carregada. Se o usuário recarrega a página ou volta nela pelo histórico do navegador, o Meta conta como uma nova compra — inflando os números.

## Solução
Adicionar uma trava no `localStorage` para que o evento só dispare **uma vez por checkout**.

## Edição: `src/pages/ThankYou.tsx`

No `useEffect`, envolver o bloco do `fbq('track', 'Purchase')` com verificação:

```typescript
const sessionId = searchParams.get('session_id');
const firedKey = sessionId ? `aura_purchase_fired_${sessionId}` : 'aura_purchase_fired';
const alreadyFired = localStorage.getItem(firedKey);

if (!alreadyFired && typeof window !== 'undefined' && (window as any).fbq) {
  (window as any).fbq('track', 'Purchase', {
    content_name: 'AURA Subscription',
    currency: 'BRL',
    ...(priceValue && { value: priceValue }),
  }, ...(eventId ? [{ eventID: eventId }] : []));
  localStorage.setItem(firedKey, 'true');
}
```

**1 arquivo, ~5 linhas alteradas.**

