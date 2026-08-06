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

## Sobre "verificar em teste"

Não é possível provar isso num teste automatizado aqui: o Chromium headless do sandbox não tem carteira Google com cartão salvo, então o Stripe.js legitimamente não renderiza o botão. Um teste automatizado que não mostra Google Pay não é evidência de bug.

O que dá pra fazer de útil, nesta ordem:

1. **Checar registro de domínio (o único ponto que ainda pode quebrar)** — Embedded Checkout só mostra carteira em domínio registrado, por ambiente. Conferir que `olaaura.com.br`, `www.olaaura.com.br` e o domínio de preview estão registrados em live e sandbox. Se faltar algum, esse é o motivo real.
2. **Teste manual em 5 minutos** — abrir `/v2/checkout` no Chrome de um Android (ou Chrome desktop logado no Google com cartão salvo), fora de aba anônima, com "permitir que sites verifiquem métodos de pagamento salvos" ligado. Google Pay deve aparecer acima do formulário de cartão. Te passo o roteiro exato.
3. **Instrumentar em vez de adivinhar** — adicionar em `src/lib/checkout-funnel.ts` um evento com o método efetivamente usado no pagamento (`google_pay` / `apple_pay` / `card`), lido do PaymentIntent no `stripe-webhook`. Assim a próxima dúvida sobre carteira se responde com dado real, não com print.
4. Registrar em memória que Apple/Google Pay no Stripe vivem dentro de `card` e que o fluxo Asaas nunca terá carteira.

## Fora de escopo

- Nenhuma mudança em `payment_method_types` (mexer ali é justamente o que quebraria as carteiras).
- Não trocar o formulário nativo do Asaas por checkout hospedado só pra ter carteira.