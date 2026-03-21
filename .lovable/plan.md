

# Fix Deduplicação Meta Ads — Plano Revisado

## Diagnóstico vs Sugestões do Gemini

| Ponto do Gemini | Status Atual | Ação |
|---|---|---|
| `event_name` idêntico (`Purchase`) | ✅ Já correto — frontend e CAPI usam `'Purchase'` | Nenhuma |
| `action_source: 'website'` na CAPI | ✅ Já correto em `meta-capi/index.ts` L79 | Nenhuma |
| Sintaxe `eventID` no 4º parâmetro do `fbq` | ⚠️ Usa spread condicional — funciona mas é frágil | Simplificar para `{ eventID: sessionId }` fixo |
| Guard contra refresh (`localStorage`) | ✅ Já implementado | Manter |
| Cookies `_fbp`/`_fbc` para Match Quality | ❌ Não implementado | **Adicionar** — capturar no Checkout, passar via Stripe metadata, enviar na CAPI |

## O que será feito

### 1. `src/pages/ThankYou.tsx`
- Usar `session_id` da URL como `eventID` (determinístico)
- Remover dependência de `localStorage('aura_event_id')` e `aura_checkout.event_id`
- Sintaxe limpa: `fbq('track', 'Purchase', {data}, { eventID: sessionId })`

### 2. `supabase/functions/stripe-webhook/index.ts`
- Usar `session.id` como `event_id` na chamada CAPI (sempre disponível)
- Remover leitura de `session.metadata?.event_id`

### 3. `src/pages/Checkout.tsx`
- Capturar cookies `_fbp` e `_fbc` do documento e enviá-los no body do `create-checkout`
- Remover geração de UUID para `event_id` (não mais necessário)

### 4. `supabase/functions/create-checkout/index.ts`
- Receber `fbp` e `fbc` → salvar no `metadata` da session Stripe

### 5. `supabase/functions/stripe-webhook/index.ts` (adicional)
- Ler `fbp`/`fbc` do metadata → incluir no payload CAPI como `user_data.fbp` e `user_data.fbc`

### 6. `supabase/functions/meta-capi/index.ts`
- Aceitar `fbp` e `fbc` em `user_data` e repassar no evento (sem hash — Meta espera raw)

## Resumo
- **5 arquivos editados**
- Deduplicação garantida via `session_id` determinístico
- Match Quality melhorado com cookies `_fbp`/`_fbc`
- Zero dependência de `localStorage` para IDs de evento

