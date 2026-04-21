

## GA4 — Implementação só com o Measurement ID

### Resposta direta

Sim, dá pra começar **só com o `G-2G7T7SJWBK`**. Cobre 100% do tracking client-side (PageView, ViewContent, Checkout, CTA clicks, FAQ, scroll, exit-intent).

A única coisa que **não** vai funcionar sem o `GA4_API_SECRET` é o evento `purchase` server-side via Measurement Protocol — ou seja, a conversão final (assinatura paga confirmada) não será registrada no GA4.

### Duas opções

**Opção A — Só com o Measurement ID (agora)**
- Trackeia tudo no navegador
- Funil até `add_payment_info` registrado normalmente
- `purchase` **fica de fora** — você verá quantos chegaram no checkout, mas não quantos pagaram (no GA4)
- O Meta Pixel/CAPI continua trackeando Purchase normalmente (sem mudança)

**Opção B — Adicionar o API Secret depois**
- Você gera o secret quando quiser em: GA4 → Admin → Data Streams → Web (escolha o stream do `G-2G7T7SJWBK`) → Measurement Protocol API secrets → Create
- Me passa, eu adiciono no `stripe-webhook` e o `purchase` server-side passa a funcionar
- Pode ser feito a qualquer momento, sem refazer nada do client-side

### Recomendação

Vamos com a **Opção A agora** (você tem só o Measurement ID), e quando quiser ativar o `purchase` server-side, você gera o API Secret e adicionamos. O resto do plano aprovado segue idêntico.

---

### O que muda no plano original

- **Secret pedido agora:** apenas `GA4_MEASUREMENT_ID` = `G-2G7T7SJWBK` (vou usar via secret no backend e hardcoded no `index.html` — ambos apontam pro mesmo ID)
- **Bloco do Measurement Protocol no `stripe-webhook`:** implementado mas com guard `if (!GA4_API_SECRET) return;` → fica dormente até você adicionar o secret depois, sem quebrar nada
- **Captura de `_ga` cookie no checkout + envio via metadata Stripe:** mantido (gera dado para quando o secret for adicionado)
- **Todo o resto do plano:** idêntico ao já aprovado

### Plano de execução

1. Pedir secret `GA4_MEASUREMENT_ID = G-2G7T7SJWBK` (via add_secret)
2. Adicionar `gtag.js` no `index.html` (condicional a marketing routes)
3. Criar `src/lib/ga4.ts` com helpers
4. Hook de PageView no `App.tsx`
5. Disparar eventos custom (Hero, Pricing, FinalCTA, Header, StickyMobileCTA, FAQ, Index, Checkout, popup exit-intent)
6. Capturar `_ga` cookie no Checkout, passar via `create-checkout` → metadata Stripe
7. Implementar bloco Measurement Protocol no `stripe-webhook` com guard de API Secret ausente (dormente)
8. Validar com extensão "GA Debugger" + DebugView do GA4
9. **(Futuro, opcional)** Quando você gerar o `GA4_API_SECRET`, me avisa que ativo o `purchase` server-side

