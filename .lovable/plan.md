

# Verificação Stripe — Novo Modelo de Trial Pago

## Status Geral: Código OK, Stripe tem resíduos do modelo antigo

## O que está correto

### Código (Edge Functions)
- **`create-checkout`**: Trial usa `mode: "payment"` com price IDs por plano (R$ 6,90 / R$ 9,90 / R$ 19,90). `trialPriceId` corretamente scopado. Metadata com `trial_validation: "true"`.
- **`stripe-webhook`**: Subscription criada com `trial_period_days: 7` e description "7 dias de acesso incluídos". PM sincronizado em subscription + customer.

### Produtos de Trial no Stripe
| Produto | Price ID | Valor | Tipo |
|---|---|---|---|
| AURA — 7 dias Essencial | `price_1THQrvQU15XnZ7VvDsiCrzqp` | R$ 6,90 | one_time |
| AURA — 7 dias Direção | `price_1THQrvQU15XnZ7VvqjHizkqv` | R$ 9,90 | one_time |
| AURA — 7 dias Transformação | `price_1THQrwQU15XnZ7Vvz7BfJdPH` | R$ 19,90 | one_time |

### Secrets configurados
- `STRIPE_PRICE_ESSENCIAL_TRIAL`, `STRIPE_PRICE_DIRECAO_TRIAL`, `STRIPE_PRICE_TRANSFORMACAO_TRIAL` — todos presentes.

## Problemas Encontrados

### 1. Subscriptions trialing existentes ainda com 5 dias e description antiga
Todas as 10 subscriptions trialing no Stripe foram criadas com o código antigo:
- Description: "5 dias grátis — a primeira cobrança será apenas no 6º dia."
- Trial de 5 dias (calculado pela diferença `current_period_end - created`)
- Exemplo: `sub_1THLQdQU15XnZ7VvI7QaYi7S` (customer `cus_UF0go0thSpa1Iu`)

**Impacto**: Esses usuários terão trial de 5 dias (não 7). É cosmético para os existentes — novas subscriptions já usarão 7 dias após o deploy.

**Ação sugerida**: Atualizar a description dessas subscriptions para consistência visual. O trial_end não pode ser alterado retroativamente sem recriar.

### 2. Produtos legados ativos no Stripe (devem ser arquivados)
Dois produtos do modelo antigo (R$1 validação + estorno) ainda estão ativos:
- **`prod_UEyr9qm6yZI1HE`** — "AURA — Ativação do Plano" (verificação de segurança, estorno automático)
- **`prod_UEX3a78rWcElLA`** — "Validação de cartão AURA" (R$1 validação)

Esses produtos não são mais usados pelo código e devem ser **arquivados** no Stripe para evitar confusão.

### 3. Customer `cus_UF0go0thSpa1Iu` tem 2 subscriptions trialing
Esse customer tem `sub_1THLQdQU15XnZ7VvI7QaYi7S` e `sub_1THJchQU15XnZ7VvquCudxgs`, ambas trialing com o mesmo price. Isso indica uma duplicação — provavelmente o webhook processou o mesmo checkout duas vezes.

**Ação sugerida**: Cancelar a subscription mais antiga (`sub_1THJchQU15XnZ7VvquCudxgs`) para evitar cobrança dupla no 6º dia.

## O que NÃO precisa de mudança no código
- `create-checkout`: correto
- `stripe-webhook`: correto (7 dias)
- `cancel-subscription`: correto
- Dunning: correto
- Frontend: já atualizado

## Plano de Ação (Stripe Dashboard / API)

### Passo 1 — Cancelar subscription duplicada
Cancelar `sub_1THJchQU15XnZ7VvquCudxgs` (duplicata do customer `cus_UF0go0thSpa1Iu`).

### Passo 2 — Arquivar produtos legados
Arquivar `prod_UEyr9qm6yZI1HE` e `prod_UEX3a78rWcElLA` (modelo R$1 validação).

### Passo 3 — Atualizar descriptions das subscriptions existentes (opcional)
Atualizar a description das 10 subscriptions trialing de "5 dias grátis" para "7 dias de acesso incluídos" para consistência visual. Não altera funcionalidade.

