# Google Pay no checkout: o que existe hoje e o que fazer

## Situação confirmada no código

**Stripe (cartão, `/v2/checkout`)**
- A sessão é criada em `create-checkout` com `ui_mode = "embedded"` e `payment_method_types = ["card"]` nos três caminhos (Semanal, assinatura, boleto legado).
- Isso está correto: no Stripe, Google Pay e Apple Pay não são tipos separados — entram junto com `card` e são renderizados pelo Stripe.js conforme o dispositivo. Não existe `payment_method_types: ["google_pay"]`.
- Ou seja: não falta código pro Google Pay. Se só o Apple Pay aparece, a causa está em configuração de conta ou no ambiente de teste.

**Asaas (cartão)**
- `criar-cartao-asaas` usa `billingType: "CREDIT_CARD"` com `creditCard` + `creditCardHolderInfo` — formulário nativo, cartão digitado na nossa página.
- Formulário nativo não suporta carteira nenhuma (nem Apple nem Google Pay). O Asaas só ofereceria carteiras no checkout hospedado dele, que não usamos. Aqui não há o que ativar.

## Confirmado no painel Stripe (print enviado)

`pmc_1Sk3NyQU15XnZ7VvnqNtcyFF`: Cartões, **Apple Pay** e **Google Pay** habilitados; Link e Boleto desabilitados. Ou seja, conta e código estão certos — não falta ativar nada.

## Resultado do teste que rodei agora

Abri `/v2/checkout?plan=direcao`, preenchi o formulário e cliquei em "Começar por R$ 9,90". No checkout embedado do Stripe encontrei:

- Dois iframes `elements-inner-express-checkout` montados (é exatamente o slot de carteira do Stripe);
- O divisor **"OU"** acima do formulário de cartão, que só é renderizado quando o Stripe planeja exibir carteira;
- Nenhum botão dentro desses iframes (texto vazio).

Leitura: **a integração está certa e o Stripe está tentando renderizar a carteira.** Os botões ficam vazios porque o navegador do teste automatizado (Chromium headless, sem login Google, sem cartão salvo na Google Wallet) não expõe carteira nenhuma — o Stripe.js esconde o botão nesse caso por desenho. Um teste headless nunca vai mostrar Google Pay, então isso não é evidência de defeito.

## O que falta pra fechar a verificação

1. **Teste manual de 3 minutos (única prova real)** — abrir `/v2/checkout` no Chrome de um Android com cartão na Google Wallet (ou Chrome desktop logado no Google com cartão salvo), fora de aba anônima, com "permitir que sites verifiquem métodos de pagamento salvos" ativo. O botão preto do Google Pay deve aparecer no espaço acima do "OU". Monto o roteiro passo a passo.
2. **Checar registro de domínio** — Embedded Checkout só exibe carteira em domínio registrado, por ambiente. Confirmar `olaaura.com.br`, `www.olaaura.com.br` e o domínio de preview registrados em live e sandbox. Se faltar algum, é aí que a carteira morre em produção mesmo com o toggle ligado.
3. **Instrumentar pra não depender de print** — registrar no funil o método efetivamente usado (`google_pay` / `apple_pay` / `card`), lido do PaymentIntent no `stripe-webhook` e gravado via `src/lib/checkout-funnel.ts`. Assim passamos a ver quanto do faturamento entra por carteira.
4. Registrar em memória que Apple/Google Pay no Stripe vivem dentro de `card` e que o fluxo Asaas nunca terá carteira.

## Fora de escopo

- Nenhuma mudança em `payment_method_types` (mexer ali é justamente o que quebraria as carteiras).
- Não trocar o formulário nativo do Asaas por checkout hospedado só pra ter carteira.