## Página de Checkout V2 (`/v2/checkout`)

Criar uma versão visual do checkout com a estética do V2 (navy escuro, sage, tipografia Fraunces, cards translúcidos), reaproveitando 100% da lógica do `Checkout.tsx` atual. A `/checkout` original (V1) **permanece intacta**.

### Arquivos novos

**`src/pages/CheckoutV2.tsx`**
- Mesma lógica do `src/pages/Checkout.tsx`: estados de plano/billing/método, validações, formatação de telefone, `handleSubmit` com Meta Pixel + CAPI + GA4, `useEffect` de ViewContent e exit-intent, chamada `supabase.functions.invoke('create-checkout')`, redirect Stripe e `localStorage.aura_checkout`.
- Visual reskinado: fundo dark navy, cards `bg-white/[0.04] border-white/10 backdrop-blur-sm`, headings `font-display` (Fraunces), inputs `bg-white/5 border-white/15 text-white`, CTA `Button variant="sage" rounded-full`.
- Header próprio simples (logo branca + link "Voltar" para `/v2`).
- `<Helmet>` com title `Checkout - AURA` e canonical `/v2/checkout`.
- Mantém: toggle Mensal/Anual, seleção dos 3 planos, destaques do plano, formulário (nome/email/telefone), bloco de garantia/segurança, exit-intent popup — todos no estilo V2.

### Arquivos editados

**`src/App.tsx`**
- `import CheckoutV2 from "./pages/CheckoutV2";`
- `<Route path="/v2/checkout" element={<CheckoutV2 />} />` acima do catch-all.

**Componentes V2 — apontar para `/v2/checkout`:**
- `src/components/v2/HeaderV2.tsx` (2 links)
- `src/components/v2/HeroV2.tsx`
- `src/components/v2/PricingV2.tsx` (2 links)
- `src/components/v2/FinalCTAV2.tsx`
- `src/components/v2/StickyMobileCTAV2.tsx`
- `src/components/v2/DemoV2.tsx`

### O que NÃO muda

- `src/pages/Checkout.tsx` e rota `/checkout` (V1) — totalmente intactos.
- Edge function `create-checkout` e qualquer lógica de Stripe/GA4/Meta.
- Nenhuma migração de banco.
