# Carteira primeiro, cartão recolhido no checkout

## O que já é verdade hoje

Apple Pay e Google Pay **já aparecem antes** do formulário de cartão: ficam no slot de express checkout, acima do divisor "OU" que o teste encontrou no iframe do Stripe. O que não dá pra mudar é o bloco de baixo — no Stripe Checkout (`ui_mode: "embedded"`, confirmado em `create-checkout`) o formulário de cartão sempre vem aberto quando cartão é o único método não-carteira. Não existe parâmetro de API pra recolher esse bloco, e carteira não é uma opção "marcável": é um botão de atalho, não um rádio.

A intuição do abandono faz sentido — campo de cartão aberto de cara pesa. Mas dentro do Checkout embedado atual isso é impossível. Pra ter o cartão atrás de um clique é preciso trocar o componente de pagamento do cartão.

## Minha recomendação: duas etapas

### Etapa 1 — medir antes de reescrever (risco baixo)

O caminho de cartão hoje monta em ~170ms e converte. Antes de mexer nele, saber quanto a carteira realmente pesa:

- Gravar no funil o método efetivamente usado em cada compra (`google_pay`, `apple_pay`, `card`), lido do PaymentIntent no `stripe-webhook`.
- Mostrar no admin a fatia carteira x cartão e a conclusão de cada um.

Se carteira já for fatia relevante, a Etapa 2 se paga. Se for quase zero, o abandono está em outro ponto e reescrever o cartão seria risco sem retorno.

### Etapa 2 — carteira em destaque, cartão em acordeão (a mudança pedida)

Trocar, **só no caminho cartão/Stripe**, o Embedded Checkout por Elements:

- `ExpressCheckoutElement` no topo: Google Pay / Apple Pay grandes, primeira coisa da tela.
- `PaymentElement` abaixo com `layout: { type: "accordion", defaultCollapsed: true }`: vira uma linha "Cartão de crédito" fechada, que abre só no clique.
- Backend: `create-checkout` passa a criar a assinatura com `payment_behavior: "default_incomplete"` e devolver o `client_secret` do PaymentIntent/SetupIntent em vez do da Checkout Session.
- Confirmação no cliente e redirect pra `/obrigado` com os mesmos parâmetros de hoje.
- PIX/Asaas intocado; o toggle Cartão x PIX Automático continua igual.

Riscos a tratar: 3DS (`request_three_d_secure: "any"` precisa continuar valendo), trial do Plano Semanal, anti-duplicação de assinatura, e os eventos de funil e de recuperação de checkout abandonado que hoje dependem da Checkout Session.

## Detalhes técnicos

- `payment_method_types: ["card"]` já cobre Apple/Google Pay — carteira não é tipo separado no Stripe.
- Carteira só renderiza em domínio registrado (`olaaura.com.br`, `www`, preview) e em navegador com cartão salvo; nunca aparece no Chromium headless dos testes.
- Etapa 1: `supabase/functions/stripe-webhook/index.ts`, `src/lib/checkout-funnel.ts`, `src/pages/AdminEngagement.tsx`.
- Etapa 2: `supabase/functions/create-checkout/index.ts`, `src/pages/CheckoutV2.tsx` e um novo `src/components/checkout/StripeCardElements.tsx`.

## Decisão

Fazer só a Etapa 1 agora (medir), ou ir direto pra Etapa 2 assumindo o risco de reescrever o caminho de cartão que hoje está rápido e funcionando?