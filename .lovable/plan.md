## Problema

Ao clicar em "Começar" na landing `/v2`, a página `/v2/checkout` abre rolada no campo **WhatsApp** em vez de mostrar a seleção de planos no topo.

Duas causas:
1. O input `#phone` em `src/pages/CheckoutV2.tsx` tem `autoFocus`, o que faz o browser rolar até ele assim que a página monta (especialmente visível no mobile, onde o form fica abaixo da dobra).
2. O `BrowserRouter` em `src/App.tsx` não tem um `ScrollToTop` global, então navegações entre rotas podem herdar a posição de scroll anterior.

## Mudanças

### 1. `src/pages/CheckoutV2.tsx`
- Remover `autoFocus` do input `#phone` (linha 810). O usuário precisa ver primeiro a seção de planos / período de cobrança no topo. O foco automático no telefone era prematuro e quebrava a hierarquia visual da página.

### 2. `src/components/ScrollToTop.tsx` (novo)
- Componente que escuta mudanças de `pathname` e faz `window.scrollTo({ top: 0, left: 0 })`. Garante que toda navegação entre rotas comece no topo.

### 3. `src/App.tsx`
- Importar `ScrollToTop` e renderizá-lo como filho direto do `<BrowserRouter>`, antes de `<Routes>`.

## Fora de escopo

- Nenhuma alteração no fluxo de pagamento, validação, Stripe/Asaas ou backend.
- Mantém o `window.scrollTo({ top: 0 })` existente após criar o `clientSecret` da Stripe (linha 422) — esse é para a transição interna do form para o widget embedado e segue necessário.
