# Beatriz: duas cobranças no mesmo dia — o que aconteceu e como fechar o furo

## O que os dados mostram (verificado agora)

Cliente: Beatriz Guimaraes — beatriz.sottomaior@gmail.com / 5511944774214 — um único cliente no Stripe (`cus_USOrDpgmfqJiDX`), sem cliente duplicado.

Ela tem **duas assinaturas ativas ao mesmo tempo**:

| Assinatura | Plano | Valor | Criada em |
|---|---|---|---|
| `sub_1TTU4R...` | Direção mensal | R$ 49,90/mês | 04/05/2026 (renovação cobrada hoje 15:49) |
| `sub_1U5Vaa...` | Essencial Trimestral | R$ 59,70/trimestre | hoje 15:48 |

Ou seja: ela era assinante ativa do Direção mensal e hoje fez um **novo checkout** do Essencial trimestral. As duas cobranças da tela são a renovação normal do plano antigo + a primeira do plano novo. Não é cobrança em dobro do mesmo plano — é assinatura duplicada.

Dois efeitos colaterais confirmados:
- O perfil dela continua com `plan = direcao` (a renovação do plano antigo, 18:52 UTC, escreveu depois da compra nova).
- Nenhum registro de `duplicate_stripe_subscription` no log de auditoria.

## Por que as travas não pegaram (a confirmar)

O código do repositório **tem** as duas proteções: o `create-checkout` deveria devolver 409 `ACTIVE_SUBSCRIPTION_EXISTS` antes de criar a sessão, e o `stripe-webhook` deveria cancelar a duplicata no `checkout.session.completed`. Nenhuma das duas agiu, e os logs das funções não estão disponíveis para o horário. Portanto a causa ainda **não está confirmada** — as hipóteses são versão publicada defasada dessas duas funções ou falha silenciosa na checagem (hoje o erro é engolido com um `console.warn` e o checkout segue).

Primeiro passo do trabalho é justamente confirmar isso, não presumir.

## Plano

### 1. Resolver o caso da Beatriz (hoje)
- Cancelar a assinatura antiga (Direção mensal) e **estornar a renovação de R$ 49,90** cobrada hoje, mantendo o Essencial trimestral que ela acabou de escolher.
- Corrigir o perfil dela para `essencial` e confirmar o acesso.
- Avisar por WhatsApp que a troca foi ajustada e o valor duplicado devolvido.

### 2. Confirmar a causa
- Verificar a versão publicada de `create-checkout` e `stripe-webhook` e republicar se estiver defasada.
- Reexecutar a checagem anti-duplicação com os dados dela em modo leitura para ver se ela realmente detecta a assinatura ativa.

### 3. Fechar o furo (independente da causa)
- **Trava por banco, antes do Stripe:** se já existe perfil com assinatura ativa (mesmo e-mail ou telefone), o checkout não segue — a checagem passa a não depender só das buscas no Stripe.
- **Falha nunca mais silenciosa:** se a checagem anti-duplicação der erro, o evento vai para o log de auditoria e o checkout é bloqueado em vez de seguir no escuro.
- **Caminho certo na interface:** assinante ativo que tenta comprar de novo recebe mensagem clara e é levado para "trocar de plano" no portal, em vez de abrir uma segunda assinatura.
- **Rede de segurança no webhook:** manter só a assinatura mais recente e registrar sempre no log, com alerta para o admin.
- **Plano do perfil não regride:** a renovação de uma assinatura antiga deixa de sobrescrever o plano quando existe assinatura mais recente ativa.

### 4. Varredura
- Rodar uma varredura em todos os clientes com mais de uma assinatura ativa no Stripe/Asaas e listar no painel — para saber se existem outros casos cobrando em paralelo agora.

## Detalhes técnicos
- `supabase/functions/create-checkout/index.ts`: pré-checagem em `profiles` antes das buscas no Stripe; bloco anti-dup passa a falhar fechado + `failed_message_log`.
- `supabase/functions/stripe-webhook/index.ts`: guarda de ordem no update de `plan` (ignora `invoice.paid` de assinatura mais antiga) e auditoria obrigatória do cancelamento de duplicata.
- `src/pages/CheckoutV2.tsx`: tratamento do 409 `ACTIVE_SUBSCRIPTION_EXISTS` com CTA para o portal.
- Nova função de varredura de assinaturas duplicadas + linha no painel administrativo.
