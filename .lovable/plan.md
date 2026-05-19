
# Checkout embedado: cartão digitado dentro do nosso domínio

## Diagnóstico confirmado
- 11/11 abandonos das últimas 24h não geraram nenhum PaymentIntent → ninguém digitou cartão.
- Não é price shock (usuário escolheu o plano e o CTA mostrava o valor certo).
- O ponto de fuga é o **salto pra `checkout.stripe.com`**: domínio diferente, layout genérico em inglês/português padrão Stripe, sem a marca AURA → quebra de confiança no exato segundo do "vou digitar meu cartão".

## Solução: Stripe Payment Element embedado
Trazer os campos de cartão pra dentro da `/v2/checkout`, mantendo nossa marca, nossas cores e a mesma URL. O usuário **nunca sai do `olaaura.com.br`**. PCI continua sendo SAQ-A (cartão entra numa iframe segura da Stripe renderizada dentro do nosso layout — não tocamos no dado).

### Por que Payment Element e não Embedded Checkout
- **Payment Element**: fields nativos no nosso form, estilizados com nossos tokens HSL. UX 100% nossa.
- **Embedded Checkout**: iframe gigante da Stripe inteira dentro de uma div. Continua parecendo Stripe.
- → Pra resolver "não sentir que mudou de site", Payment Element é o caminho.

## Mudanças

### 1. Nova edge function `create-payment-intent`
Reaproveita 80% da lógica atual de `create-checkout`:
- Mesma validação de input, mesma anti-dup, mesma criação/atualização de customer.
- **Trial semanal** (caso atual padrão): cria `PaymentIntent` de R$ 6,90/9,90/19,90 com:
  - `setup_future_usage: 'off_session'` (mantém estratégia CIT→MIT)
  - `payment_method_types: ['card']`
  - `payment_method_options.card.request_three_d_secure: 'any'`
  - metadata: plan, billing, phone, fbp, fbc, gaClientId, source
- **Mensal/anual**: cria `Subscription` com `payment_behavior: 'default_incomplete'`, `expand: ['latest_invoice.payment_intent']`, retorna `client_secret` da 1ª fatura.
- Retorna `{ clientSecret, customerId, intentId }`.

`create-checkout` original fica intacto (usado pela `/v1/checkout` legacy).

### 2. Refactor de `src/pages/CheckoutV2.tsx`
- Instalar `@stripe/stripe-js` + `@stripe/react-stripe-js`.
- Adicionar `VITE_STRIPE_PUBLISHABLE_KEY` (chave pública, ok no front).
- Novo componente `<EmbeddedCardForm clientSecret={...} />`:
  - Wrappa com `<Elements stripe={stripePromise} options={{ clientSecret, appearance, locale: 'pt-BR' }}>`.
  - `appearance` custom com tokens HSL do `v2-theme.css` (cor sage, fundo escuro, border-radius arredondado, fonte display).
  - Renderiza `<PaymentElement options={{ layout: 'tabs' }} />` — habilita Apple Pay / Google Pay automático se o device suportar (bônus).
  - Botão único de submit chama `stripe.confirmPayment({ elements, confirmParams: { return_url: '${origin}/obrigado' } })`.

### 3. Fluxo de UX revisado
1. Usuário preenche Nome + Email + WhatsApp + escolhe plano (igual hoje).
2. Quando o form fica válido (debounce ao sair do campo WhatsApp), dispara `create-payment-intent` em background — `client_secret` volta em ~1s.
3. Bloco de cartão (PaymentElement) aparece logo abaixo do form, animado.
4. Botão único "Pagar R$ X,XX e começar" → confirma na Stripe → redireciona pra `/obrigado` no sucesso.
5. Erros (cartão recusado, 3DS falho) aparecem **inline** no nosso layout, dá pra tentar outro cartão sem perder dados.

### 4. Tracking
- Mantém Lead + InitiateCheckout no submit do form (Pixel + CAPI).
- Novo `AddPaymentInfo` quando PaymentElement monta.
- `Purchase` continua em `/obrigado` (webhook já trata).

### 5. Webhook
Sem mudança. `stripe-webhook` já trata `payment_intent.succeeded` e `customer.subscription.created` e cria perfil + dispara welcome no WhatsApp.

## O que não muda
- Schema do banco, `checkout_sessions`, recuperação por email, anti-dup, price IDs, planos, domínio, design da página.

## Riscos
- **3DS challenge**: tratado nativamente pelo Payment Element (modal sobre a página, sem sair do domínio).
- **Chave pública no front**: ok, é o padrão. Adicionar `VITE_STRIPE_PUBLISHABLE_KEY` nos secrets.
- **Pixel/CAPI**: pode precisar disparar Purchase no `/obrigado` consultando o intent (já é o que o webhook faz — sem mudança).

## Sequência de entrega
1. Criar `create-payment-intent` reaproveitando `create-checkout`.
2. Adicionar pacotes `@stripe/stripe-js` + `@stripe/react-stripe-js` e secret `VITE_STRIPE_PUBLISHABLE_KEY`.
3. Refactor do submit em `CheckoutV2.tsx` + componente novo `<EmbeddedCardForm />`.
4. Testar em sandbox: trial semanal, cartão 3DS, cartão recusado, Apple Pay.
5. Publicar e monitorar `payment_intent.created` vs `payment_intent.succeeded` nas próximas 48h pra ver se o gap fecha.

## Estimativa
~250 linhas de edge function nova (reuso alto) + ~200 linhas de frontend (componente novo + ajuste do submit). 1 secret novo (chave pública).

Confirma que sigo por aí? Se topar, no próximo turno eu já implemento.
