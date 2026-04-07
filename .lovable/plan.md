

## Diagnóstico

Encontrei **3 problemas críticos** na implementação atual dos eventos Meta:

### Problema 1: InitiateCheckout dispara 2x
O evento `InitiateCheckout` dispara no `useEffect` (page load) E novamente quando o usuário clica "Começar" (submit do formulário). São event_ids diferentes, então o Meta conta como eventos separados. Isso explica os 33 eventos no Meta vs 3 checkouts reais.

### Problema 2: Evento Purchase NUNCA é enviado
O comentário no ThankYou.tsx diz "Purchase event is sent server-side only (CAPI via stripe-webhook)" — mas o stripe-webhook **não tem nenhum código** enviando o evento Purchase via CAPI. Zero. O Meta não recebe nenhum sinal de conversão.

### Problema 3: Evento Lead não existe
Quando o usuário preenche o formulário e clica "Começar", não há evento `Lead` — que é o sinal mais importante para o Meta otimizar campanhas de geração de leads.

---

## Plano de Correção

### 1. Reorganizar o funil de eventos

```text
Visitou /checkout  →  PageView (já existe no index.html)
                       ViewContent (browser pixel)
Preencheu e clicou  →  Lead (browser + CAPI com PII)
                       InitiateCheckout (browser + CAPI com PII)
Pagou no Stripe     →  Purchase (CAPI com PII via stripe-webhook)
```

### 2. Arquivo: `src/pages/Checkout.tsx`
- **Remover** o `useEffect` que dispara `InitiateCheckout` no page load (linhas 82-126)
- **Adicionar** `ViewContent` no page load (browser pixel apenas, sem CAPI — tráfego frio)
- **No submit do formulário** (onde já tem PII): disparar `Lead` + `InitiateCheckout` via browser pixel E CAPI, com event_id compartilhado e fbp/fbc

### 3. Arquivo: `supabase/functions/stripe-webhook/index.ts`
- Após confirmação de pagamento (`checkout.session.completed`), enviar evento `Purchase` via CAPI com email, telefone e valor da transação

### 4. Arquivo: `supabase/functions/meta-capi/index.ts`
- Sem alterações necessárias — já suporta os campos necessários

---

## Resultado Esperado
- **ViewContent**: 1x por visitante do checkout (tráfego)
- **Lead + InitiateCheckout**: 1x por lead real que preencheu dados (com PII → match quality alta)
- **Purchase**: 1x por pagamento confirmado (server-side, impossível de perder)
- Match Quality deve subir de 6.1/10 para 8+/10 nos eventos com PII

