
## Contexto

Hipótese confirmada via teste mobile (375×812) em preview e produção. Dois problemas distintos no `/v2/checkout`:

1. **Campo WhatsApp abaixo da dobra** → usuário clica CTA antes de preencher → toast de erro silencioso → abandona sem aparecer em `checkout_sessions`.
2. **EmbeddedCheckout pós-submit confuso** → após clicar "Começar", widget Stripe demora ~3s, aparece como área branca, sem instrução clara → muitos `requires_payment_method` no Stripe.

Decisão: **manter EmbeddedCheckout** (hosted já teve conversão pior antes) e corrigir UX nas duas frentes.

## PR 1 — Corrigir form mobile (Problema 1)

Arquivo: `src/pages/CheckoutV2.tsx`

1. **Reordenar campos:** WhatsApp passa para PRIMEIRO, depois Nome, depois Email. Phone é o que importa pro produto.
2. **Validação inline:** trocar `toast.error` por mensagens vermelhas embaixo de cada campo. Estado `errors: { name?, email?, phone? }`.
3. **Auto-scroll:** no submit, se houver erro, `document.getElementById(firstInvalidField)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
4. **Desabilitar CTA enquanto inválido:** `disabled={!name.trim() || !validEmail(email) || phoneDigits.length < 11 || isLoading}` com opacidade reduzida.

## PR 2 — Consertar UX do EmbeddedCheckout (Problema 2)

Arquivo: `src/pages/CheckoutV2.tsx` (tela "Confirme e pague")

1. **Skeleton de loading** no lugar da área branca enquanto o widget Stripe carrega (entre `create-checkout` retornar e o iframe Stripe renderizar). Usar evento `onReady` do `EmbeddedCheckoutProvider` para esconder o skeleton.
2. **Instrução clara acima do widget** depois do submit: substituir/adicionar texto destacado "**Preencha o cartão abaixo para finalizar ↓**" (cor sage, font-display, centralizado).
3. **Auto-scroll para o widget** assim que ele monta: ref no container do `EmbeddedCheckout` + `useEffect` que scrolla quando `clientSecret` chega.
4. **Esconder o CTA "Começar por R$ 9,90" superior** após submit. Hoje ele continua visível e cria ambiguidade ("já cliquei, por que ainda está aqui?"). Já existe a tela "Confirme e pague" — garantir que o botão superior NÃO reapareça nessa view.
5. **Texto do botão "Editar dados"** ficar mais discreto para não competir com o foco no cartão.

## Verificação

Depois de implementar, rodar no browser mobile (375×812):
- PR 1: clicar CTA com campos vazios → ver erro inline + scroll automático até o campo.
- PR 2: preencher tudo + submeter → ver skeleton → widget Stripe aparecer com scroll automático + instrução clara visível.

## Fora de escopo (anotado pra depois)

- Métrica real de funil (`payment_attempted_at` em `checkout_sessions`) — só depois que conversão estabilizar.
- Não mexer no backend `create-checkout` nem em webhooks Stripe.
