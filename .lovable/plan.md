# Checkout no cartão: deixar o pagamento aparecer rápido

## O que está acontecendo hoje

Quando o cliente clica em "Continuar" no cartão, três coisas acontecem **em fila** antes do campo de cartão aparecer:

1. A função de backend `create-checkout` acorda (cold start) e faz **até 10 chamadas seguidas** à Stripe, uma esperando a outra: busca cliente por telefone, busca por e-mail, lista por e-mail, busca de novo por telefone, lista assinaturas ativas, lista assinaturas em trial, consulta preço, cria/atualiza cliente e só então cria a sessão de checkout.
2. Só **depois** da resposta é que o navegador começa a baixar o `js.stripe.com` (a biblioteca da Stripe), porque a chave pública vem nessa resposta.
3. Só então o iframe da Stripe monta e pinta o formulário.

Somando cold start + chamadas em série + download da biblioteca, dá facilmente 5-20s em rede móvel. Enquanto isso o cliente vê um "skeleton" cinza — e é aí que ele desiste.

## O que vamos fazer

### 1. Começar a carregar a Stripe antes do clique (ganho maior e mais barato)
- Pré-conectar a `js.stripe.com` no `index.html` (`preconnect` + `dns-prefetch`).
- Disparar o carregamento da biblioteca da Stripe assim que a página de checkout abre, usando a chave pública já conhecida no front, em vez de esperar a resposta do backend.
- Assim, quando o `clientSecret` chega, o iframe monta quase instantaneamente.

### 2. Preparar a sessão de pagamento em paralelo com o preenchimento
- Aquecer a função de backend com um ping leve quando o cliente toca no primeiro campo (mata o cold start).
- Quando nome, e-mail e WhatsApp já estão válidos, criar a sessão em background (debounce), guardando o `clientSecret`. Ao clicar em "Continuar", o pagamento aparece na hora.
- Se os dados mudarem depois, a sessão pré-criada é descartada e recriada (a sessão só vira cobrança quando o cliente paga, então pré-criar é seguro).

### 3. Enxugar o backend: de ~10 chamadas em série para ~3
- Rodar as buscas de cliente (telefone e e-mail) **em paralelo** e eliminar as duplicadas (hoje o mesmo e-mail/telefone é consultado 2x).
- Rodar as consultas de assinatura ativa/trial em paralelo.
- Remover a consulta de preço no caminho crítico (usar os dados de preço que já temos no código).
- Objetivo: tempo do backend cair de segundos para menos de 1s.

### 4. Deixar a espera honesta e o fallback mais rápido
- Baixar o timeout do widget de 12s para ~6s antes de mandar pro checkout hospedado da Stripe (que é rápido e nunca fica em branco).
- Trocar o skeleton por um estado com texto claro ("preparando o pagamento seguro…") e o resumo do pedido visível, para a espera não parecer travamento.

### 5. Medir para provar
- Gravar no funil o tempo de cada etapa: `create_checkout_ms`, `stripe_js_ms`, `embedded_mounted_ms`.
- Painel admin: mostrar o tempo médio até o campo de cartão aparecer e a taxa de fallback/timeout.

## Detalhes técnicos

- `index.html`: `<link rel="preconnect" href="https://js.stripe.com">`.
- `src/pages/CheckoutV2.tsx`: `loadStripe` chamado no mount (chave publicável do front); estado `prewarmedSession` com `clientSecret` + hash dos dados do form; timeout do poll de iframe 12000 → 6000; instrumentação via `logFunnel`.
- `supabase/functions/create-checkout/index.ts`: agrupar lookups em `Promise.all`, remover buscas duplicadas de cliente, remover `prices.retrieve` do caminho crítico, aceitar um modo `warmup` que retorna 200 sem chamar a Stripe.
- Nada muda em preços, planos, trial, PIX/Asaas ou regra anti-duplicação de assinatura — só ordem e paralelismo das chamadas.

## Fora de escopo
- Mudar de embedded para hosted como padrão.
- Mexer no fluxo PIX.
