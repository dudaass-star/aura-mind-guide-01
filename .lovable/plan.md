

# Fix: Meta contabilizando Purchase 2x

## Problema
Dois sinais de Purchase idênticos sendo enviados:
1. **Browser** (ThankYou.tsx L41): `fbq('track', 'Purchase')` com `eventID: session_id`
2. **Servidor** (stripe-webhook L287): CAPI `Purchase` com `event_id: session.id`

Ambos usam o mesmo `event_id`, mas Meta não deduplica corretamente (diferença nos dados de usuário entre browser e servidor).

## Solução: Remover Purchase do browser, manter apenas CAPI

### Arquivo: `src/pages/ThankYou.tsx`
- Remover linhas 32-47 (todo o bloco do `fbq('track', 'Purchase', ...)`)
- Manter o resto do `useEffect` (parsing de nome/plano para exibição)

O CAPI no `stripe-webhook` já dispara o Purchase no `checkout.session.completed` — mesmo durante trial, com valor R$0 ou o valor correto. Isso garante 1 único evento por checkout.

### Nenhuma mudança no stripe-webhook
O evento CAPI já está correto e já dispara no momento do checkout (trial ou não).

**Resultado**: 1 Purchase por checkout, via CAPI server-side, sem duplicação.

