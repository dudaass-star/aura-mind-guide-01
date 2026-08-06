# Por que os 10 inícios de checkout não viraram venda

## O que os dados mostram (verificado agora)

- Últimos 3 dias: **10 linhas em `checkout_sessions`**, todas ciclo **mensal**, todas `payment_method = card`, todas com `stripe_session_id` preenchido e **nenhuma** com `completed_at`.
- **Nenhuma venda no cartão desde 25/07** (11 dias). Os únicos clientes novos do período pagaram por **PIX**: Elenice (30/07), Eduardo (03/08), Lisiane (05/08).
- Na Stripe, no período das 10 tentativas, existe **um único PaymentIntent** — e é a renovação de R$ 29,90 de um assinante antigo. Ou seja: **ninguém chegou a submeter cartão**. Não são recusas de banco; é abandono antes de tentar pagar.
- As sessões Stripe existem, abertas, `ui_mode: embedded_page`, com o valor certo (ex.: R$ 9,90 do Direção), `payment_status: unpaid`.
- Checkout no PIX **não grava nada** em `checkout_sessions` — o funil do PIX é hoje invisível: não sabemos quantos começaram no PIX nem onde pararam.

## Leitura (esta parte ainda é hipótese)

O padrão "sessão criada + zero submissão de cartão, 10 vezes seguidas" é forte demais para ser só falta de vontade. Duas hipóteses explicam isso:

1. **O widget embedado da Stripe não está aparecendo/funcionando** (mobile em especial): a pessoa preenche nome/email/WhatsApp, clica, a página troca para a área de pagamento e nada renderiza — ou renderiza fora da dobra. Isso é consistente com zero tentativas de cobrança.
2. **Assimetria de preço entre cartão e PIX no mensal**: o cartão oferece 7 dias por R$ 6,90/9,90/19,90 e o PIX cobra R$ 29,90/49,90/79,90 na hora. Quem prefere PIX (maioria no Brasil) vê o preço baixo só no cartão. Isso explica perda de lead, mas **não** explica os 10 que escolheram cartão e travaram.

Não vou afirmar qual das duas é a causa sem medir. O plano começa medindo.

## Plano

### 1. Reproduzir o passo do cartão de ponta a ponta
Rodar o fluxo real de `/v2/checkout` no mobile (393px) e no desktop, até o ponto em que o Embedded Checkout deveria montar, capturando console, requisições e screenshot. Objetivo: ver se o widget monta, em quanto tempo, e se há erro de Stripe.js / publishableKey / iframe bloqueado. Isso cria uma sessão de teste na Stripe (sem cobrança).

### 2. Instrumentar o funil (hoje cego)
Registrar eventos de etapa no banco e no GA4:
- `form_submit_card`, `embedded_mounted`, `embedded_error` (com a mensagem da Stripe), `payment_submitted`
- `pix_toggle`, `pix_modal_open`, `qr_generated`, `qr_expired`, `authorized`

Assim, na próxima leva de 10, a resposta vem da tabela em vez de dedução.

### 3. Fazer o PIX aparecer no funil
Gravar linha em `checkout_sessions` também quando o checkout começa pelo PIX (`payment_method = 'pix'`) e marcar `completed_at` na confirmação pelo webhook Asaas. Hoje o único método que converte é justamente o que não medimos.

### 4. Corrigir o que a etapa 1 apontar
Se o widget estiver falhando: fallback para o Checkout hospedado da Stripe (redirect por `session.url`) quando o embedado não montar em alguns segundos, e estado de erro visível em vez de tela vazia.

### 5. Só depois: preço de entrada no PIX
Primeira semana barata no PIX é mudança de negócio (o Asaas não tem trial nativo: exige 1ª cobrança cheia ou um QR avulso barato + autorização recorrente). Vale testar, mas depois de sabermos se o cartão está tecnicamente quebrado — senão trocamos preço para consertar um bug.

## Detalhes técnicos

- Arquivos envolvidos: `src/pages/CheckoutV2.tsx` (submit do cartão, montagem do `EmbeddedCheckout`, modal PIX), `supabase/functions/create-checkout/index.ts` (grava `checkout_sessions` e cria a sessão embedada), `supabase/functions/criar-pix-recorrente-asaas/index.ts`, `supabase/functions/webhook-asaas/index.ts` (marcaria `completed_at` do PIX), `supabase/functions/stripe-webhook/index.ts` (já marca `completed_at` no cartão).
- `isPixPeriod(b) => b !== "monthly"` é o que faz o mensal exibir cartão com trial vs PIX cheio — origem da assimetria da hipótese 2.
- Etapas 2 e 3 são aditivas: nenhum caminho de pagamento muda de comportamento.