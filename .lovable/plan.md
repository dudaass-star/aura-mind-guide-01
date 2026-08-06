# Cartão colapsado, carteira marcada — como chegar no layout da imagem

## O que a imagem mostra

A referência é exatamente o alvo: Apple Pay em cima, divisor "OU", e depois "Forma de pagamento" como lista de rádio — **Cartão fechado** e **Google Pay marcado**, com o botão preto do Google Pay embaixo.

Detalhe importante: esse layout é do próprio Stripe Checkout, o mesmo produto que já usamos. Ele aparece quando o navegador do cliente tem carteira disponível — nesse caso o Stripe troca o formulário de cartão aberto por essa lista de rádio com o cartão recolhido. No teste automatizado não existe carteira, então sobra só cartão e ele abre. Em celular com Google Pay/Apple Pay o cliente provavelmente já vê algo muito próximo da imagem hoje.

O que **não** temos no Checkout é controle: a ordem e qual opção vem marcada são decididas pelo ranqueamento dinâmico do Stripe. Não existe parâmetro de Checkout Session pra colapsar o cartão ou forçar "Google Pay marcado".

## Passo 1 — confirmar em dispositivo real antes de reescrever nada

Abrir `/v2/checkout` num Android com cartão na Google Wallet (ou iPhone/Safari com Apple Pay) e tirar print. Dois desfechos:

- **Já vem como a imagem** → nada a mudar no código; o abandono está em outro ponto.
- **Vem com cartão aberto mesmo com carteira disponível** → aí sim vale o Passo 2.

Te passo o roteiro exato (3 minutos).

## Passo 2 — se precisar forçar: trocar o cartão pra Payment Element

Só com Elements existe o controle explícito que a imagem sugere. Escopo restrito ao caminho **cartão/Stripe**:

- `ExpressCheckoutElement` no topo (Google Pay / Apple Pay grandes).
- `PaymentElement` abaixo com `layout: { type: "accordion", defaultCollapsed: true }` → linha "Cartão" fechada, que abre no clique.
- `paymentMethodOrder: ["google_pay", "apple_pay", "card"]` → carteira primeiro, cartão por último.
- Backend: `create-checkout` cria a assinatura com `payment_behavior: "default_incomplete"` e devolve o `client_secret` do PaymentIntent/SetupIntent em vez do da Checkout Session.
- Confirmação no cliente e redirect pra `/obrigado` com os mesmos parâmetros de hoje.
- PIX/Asaas intocado; o toggle Cartão x PIX Automático segue igual.

Riscos a tratar: 3DS (`request_three_d_secure: "any"` precisa continuar valendo), trial do Plano Semanal, anti-duplicação de assinatura, e os eventos de funil e de recuperação de checkout abandonado que hoje dependem da Checkout Session.

## Detalhes técnicos

- `paymentMethodOrder` e `layout.defaultCollapsed` são opções do **Payment Element**, não da Checkout Session — daí a necessidade do Passo 2 pra forçar o layout.
- `payment_method_types: ["card"]` já cobre Apple/Google Pay; carteira não é tipo separado.
- Carteira só renderiza em domínio registrado (`olaaura.com.br`, `www`, preview) e em navegador com cartão salvo.
- Passo 2 mexe em: `supabase/functions/create-checkout/index.ts`, `src/pages/CheckoutV2.tsx` e um novo `src/components/checkout/StripeCardElements.tsx`.

## Decisão

Confirmo primeiro no celular (Passo 1), ou já implemento o Passo 2 direto, aceitando reescrever o caminho de cartão que hoje monta em ~170ms e está funcionando?