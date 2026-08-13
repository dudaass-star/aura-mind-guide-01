# Funil de checkout — agosto/2026: números reais e o gargalo do cartão

## 1. Quem clicou em pagar (01–13/08, BRT)

A instrumentação do funil só existe a partir de **06/08**, então a base de "abriu o checkout" cobre 06–13/08. As sessões (`checkout_sessions`) cobrem o mês inteiro.

| Etapa | Cartão | PIX |
|---|---|---|
| Abriu a página do checkout | 245 sessões (sem separar método) | — |
| Preencheu nome/e-mail/telefone e enviou | 29 sessões | — |
| Formulário do Stripe carregou de fato | 29 sessões | — |
| Abriu a janela do PIX | — | 11 sessões |
| QR gerado | — | 8 sessões |
| Copiou o código | — | 2 sessões |
| **Pessoas distintas que iniciaram pagamento** | **47** | **14** |

## 2. Quem efetivamente pagou

| Método | Iniciaram | Pagaram | Taxa |
|---|---|---|---|
| Cartão (Stripe) | 47 pessoas | 2 | 4,3% |
| PIX Automático | 14 (12 reais + 2 testes) | 4 (2 reais + 2 testes) | ~17% sobre os reais |

Pagantes reais: Eduardo (02/08, cartão), Valéria (07/08, cartão), Cris Silveiira (12/08, PIX Woovi R$ 6,90) e Paula Cristina (12/08, PIX Woovi R$ 9,90).

**Correção de leitura:** dos 4 PIX pagos, só **2 são testes** (`pixauto.teste.inter@`, `pixauto.teste2.inter@`, trilho Inter, 11/08). Os dois de 12/08 são clientes reais no trilho **Woovi**, ativos até 12/09 — e são as duas únicas vendas dos últimos 5 dias. O PIX Woovi vendeu no primeiro dia no ar.

## 3. Gargalo principal: a conclusão no cartão

47 pessoas entregaram nome, e-mail e WhatsApp, 29 sessões viram o formulário do Stripe montar — e **2 pagaram**. Quem preenche três campos e chega até o cartão já decidiu comprar; perder ~95% aí não é falta de intenção, é atrito na tela final.

O que sabemos com certeza: o widget **monta** (29 de 29 `embedded_requested` viraram `embedded_mounted`, zero timeouts, zero fallbacks para tela hospedada). Então não é falha de carregamento nem salto de domínio — como você disse, isso já foi resolvido.

O que **não** sabemos: se essas pessoas chegaram a submeter o cartão. O clique real acontece dentro do iframe do Stripe e nunca foi registrado; o `card_declined` só entrou no ar ontem. Sem esse dado não há como separar "olhou e desistiu" de "digitou e o banco recusou" — e as duas causas pedem correções opostas.

Hipótese a verificar (não confirmada): o Embedded Checkout renderiza a **interface completa da Stripe** dentro do nosso bloco branco — com resumo de pedido próprio, e-mail pedido de novo, e o preço apresentado no formato da Stripe. Isso duplica informação que a pessoa acabou de preencher e pode ler como "recomeçou o checkout" na hora mais frágil. É plausível, mas eu preciso ver a tela real antes de afirmar.

## 4. G4 (formulário vazio) é ruído, não gargalo

23 cliques com os três campos em branco vieram de 19 sessões — e **14 dessas 19 preencheram e enviaram em seguida**. Só 5 sessões pararam ali. Você está certo: diante de 245 visitas, é irrelevante. Sai da lista de prioridades; a melhoria de validação inline entra como polimento, não como correção de conversão.

## 5. G5: PIX indisponível na maior parte do mês (contexto obrigatório)

46 sessões em 11/08 receberam "PIX indisponível" (Asaas com 401) e 07/08 teve 4 erros de geração de QR. O PIX só funcionou de fato em 12/08. Ou seja: praticamente todo agosto empurrou 100% do tráfego para o cartão — o método que menos converte. E 227 das 245 visitas abriram no plano **Direção** (R$ 29,90 como primeiro preço), padrão trocado para Essencial só ontem. Qualquer conclusão sobre conversão a partir de agosto está contaminada por esses dois fatores.

## 6. Plano de ação

**Passo 1 — Ver com os próprios olhos o que a pessoa vê no cartão.**
Reproduzir o fluxo completo de `/v2/checkout` em mobile (390px) e desktop, até o formulário do Stripe montado, com captura de tela. Objetivo: verificar se há e-mail duplicado, resumo de pedido concorrente, preço apresentado de forma confusa, corte de altura no mobile ou botão de pagar fora da dobra. Isso valida ou derruba a hipótese acima antes de mexer em nada.

**Passo 2 — Fechar o ponto cego da submissão.**
Registrar no funil o momento em que a pessoa realmente tenta pagar, além do `card_declined` já ativo. Com Embedded Checkout isso é limitado (iframe fechado), então incluo aqui a alternativa: se o passo 1 confirmar atrito de interface, migrar para o **Payment Element** — formulário de cartão puro dentro do nosso layout, com o nosso botão ("Começar por R$ 6,90"), sem segundo resumo, sem segundo e-mail, e com o clique 100% mensurável. Essa mudança resolve o atrito e a medição de uma vez.

**Passo 3 — Corrigir o que o passo 1 apontar,** dentro do Embedded (custom_text, altura, ordem dos elementos) ou na migração para Payment Element, conforme o achado.

**Passo 4 — Painel de funil por método no Admin,** contando pessoas distintas (não linhas) e separando cartão e PIX, para acompanhar o efeito das mudanças de ontem sem consulta manual ao banco.

**Passo 5 — Higiene de dados:** excluir das métricas as contas de teste `@olaaura.com.br`.

## Detalhes técnicos

- Números extraídos de `checkout_funnel_events` e `checkout_sessions`, cruzados com `profiles.card_gateway` e `woovi_charges`.
- Estado atual do cartão: `create-checkout` cria sessão com `ui_mode: "embedded"` e `return_url` para `/obrigado`; `CheckoutV2.tsx` monta `<EmbeddedCheckout />` num bloco branco de `min-h-[480px]` no passo 2, com fallback para tela hospedada por timeout (nunca acionado em agosto).
- Passo 2/3 (se migrar): `create-checkout` passa a criar Subscription/PaymentIntent com `client_secret` para `<PaymentElement />`; confirmação via `stripe.confirmPayment` no frontend, o que dá os eventos `card_pay_click` e `card_error` com o código real do banco. O `stripe-webhook` continua sendo a fonte de verdade da ativação — nada muda no provisionamento.
- Passo 4: agregação por `anon_session_id` distinto em `AdminEngagement.tsx`, com corte por `payment_method` e pelo `plan` do `page_view`.
