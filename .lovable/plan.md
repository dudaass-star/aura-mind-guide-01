# Google Pay no checkout: o que existe hoje e o que fazer

## Situação confirmada no código

**Stripe (cartão, `/v2/checkout`)**
- A sessão é criada em `create-checkout` com `ui_mode = "embedded"` e `payment_method_types = ["card"]` nos três caminhos (Semanal, assinatura, boleto legado).
- Isso está correto: no Stripe, Google Pay e Apple Pay não são tipos separados — entram junto com `card` e são renderizados pelo Stripe.js conforme o dispositivo. Não existe `payment_method_types: ["google_pay"]`.
- Ou seja: não falta código pro Google Pay. Se só o Apple Pay aparece, a causa está em configuração de conta ou no ambiente de teste.

**Asaas (cartão)**
- `criar-cartao-asaas` usa `billingType: "CREDIT_CARD"` com `creditCard` + `creditCardHolderInfo` — formulário nativo, cartão digitado na nossa página.
- Formulário nativo não suporta carteira nenhuma (nem Apple nem Google Pay). O Asaas só ofereceria carteiras no checkout hospedado dele, que não usamos. Aqui não há o que ativar.

## Causas prováveis do Google Pay não aparecer (verificar nesta ordem)

1. **Toggle no Payment Method Configuration da conta Stripe** — Google Pay pode estar desligado com o Apple Pay ligado. Suspeito nº 1, resolve-se no painel, sem código.
2. **Registro de domínio** — Embedded Checkout exige `olaaura.com.br` e subdomínios registrados por ambiente (live e sandbox). Apple Pay funcionando sugere domínio principal ok, mas vale checar os de preview.
3. **Ambiente de teste** — Google Pay só renderiza em Chrome/Edge com cartão salvo na Google Wallet, fora de aba anônima e com "permitir que sites verifiquem métodos de pagamento salvos" ativo. Em iPhone/Safari nunca aparece.

## O que eu faria

1. Ler a configuração de métodos de pagamento da conta Stripe e reportar se Google Pay está ativo e se os domínios do checkout estão registrados em live e sandbox.
2. Se estiver desligado, te passar o passo exato no painel (é ação de conta, não de código) e validar a renderização com teste real no Chrome.
3. Adicionar evento de funil em `checkout-funnel.ts` registrando o método efetivamente usado (carteira vs cartão digitado) — hoje não medimos isso.
4. Registrar em memória que Apple/Google Pay no Stripe vivem dentro de `card` e que o fluxo Asaas nunca terá carteira, pra não voltar essa dúvida.

## Fora de escopo

- Nenhuma mudança em `payment_method_types` (mexer ali é justamente o que quebraria as carteiras).
- Não trocar o formulário nativo do Asaas por checkout hospedado só pra ter carteira.