

# Auditoria: Trial Pago — Problemas Encontrados e Correções

## Problemas Identificados

### 1. BUG CRITICO: `TRIAL_VALIDATION_PRICE_ID` indefinido (runtime crash)
**Arquivo:** `supabase/functions/create-checkout/index.ts` (linha 235)

O log usa `TRIAL_VALIDATION_PRICE_ID` que **nunca foi declarado** — é um resquício do código antigo. Isso causa um `ReferenceError` no runtime e **impede a criação de qualquer checkout de trial**.

**Fix:** Trocar por `trialPriceId` (variável correta definida na linha 162).

### 2. Log desatualizado no webhook: "No payment method found after R$1 charge"
**Arquivo:** `supabase/functions/stripe-webhook/index.ts` (linha 186)

Mensagem de log ainda menciona "R$1 charge". Não causa erro, mas confunde na depuração.

**Fix:** Atualizar texto para "after paid trial charge".

### 3. Textos antigos no frontend (4 arquivos)

| Arquivo | Linha | Texto atual | Correção |
|---|---|---|---|
| `src/components/ForWho.tsx` | 81 | "Experimente Grátis" | "Começar por R$ 6,90" |
| `src/components/ForWho.tsx` | 85 | "5 dias grátis. Cancele quando quiser." | "7 dias por R$ 6,90. Cancele quando quiser." |
| `src/components/Demo.tsx` | 514 | "5 dias grátis • Cancele quando quiser" | "7 dias por R$ 6,90 • Cancele quando quiser" |
| `src/pages/UserGuide.tsx` | 609-613 | "5 conversas grátis... Começar Grátis" | "7 dias por R$ 6,90... Começar agora" |
| `src/pages/Index.tsx` | 34 | meta description com "Comece grátis" | "Experimente por 7 dias" |

### 4. AdminEngagement com referência "5d"
**Arquivo:** `src/pages/AdminEngagement.tsx` (linha 315-316)

Texto "< 5d" e "trial > 5d" nas métricas do admin. Deve refletir 7 dias.

### 5. Webhook e backend: lógica de 5 dias em outras funções
Preciso verificar `cleanup-inactive-users`, `session-reminder`, e `scheduled-checkin` para referências ao trial de 5 dias.

## O que está correto

- `create-checkout`: lógica de trial usa `mode: "payment"` com price IDs por plano
- `stripe-webhook`: sem refund, sem filtro de funding, `trial_period_days: 7`
- `Checkout.tsx`: preços dinâmicos, depoimento, garantia, tudo ok
- `Pricing.tsx`: trust badges atualizados para "7 dias a partir de R$ 6,90"
- `Hero.tsx` e `FinalCTA.tsx`: textos atualizados
- `FAQ.tsx`: atualizado
- Secrets configurados: `STRIPE_PRICE_ESSENCIAL_TRIAL`, `STRIPE_PRICE_DIRECAO_TRIAL`, `STRIPE_PRICE_TRANSFORMACAO_TRIAL`

## Plano de Correção

### Passo 1 — Fix crítico no `create-checkout`
Linha 235: trocar `TRIAL_VALIDATION_PRICE_ID` por `trialPriceId`. Redeploy da função.

### Passo 2 — Atualizar textos antigos nos 4 componentes
`ForWho.tsx`, `Demo.tsx`, `UserGuide.tsx`, `Index.tsx` — substituir "grátis/5 dias" por "7 dias por R$ 6,90".

### Passo 3 — Atualizar AdminEngagement
Trocar "< 5d" por "< 7d" nas métricas de trial.

### Passo 4 — Limpar log no webhook
Atualizar mensagem "R$1 charge" na linha 186.

### Passo 5 — Verificar e atualizar funções de backend
Checar `cleanup-inactive-users`, `session-reminder`, `schedule-setup-reminder` para referências de 5 dias e atualizar para 7.

## Arquivos modificados

| Arquivo | Tipo |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Bug fix + redeploy |
| `supabase/functions/stripe-webhook/index.ts` | Log text cleanup |
| `src/components/ForWho.tsx` | Texto trial |
| `src/components/Demo.tsx` | Texto trial |
| `src/pages/UserGuide.tsx` | Texto trial |
| `src/pages/Index.tsx` | Meta description |
| `src/pages/AdminEngagement.tsx` | Métricas trial |
| Backend functions (verificar) | Período 5→7 dias |

