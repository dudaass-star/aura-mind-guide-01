

# Auditoria Final: Trial Pago — Problemas Restantes

## Status Geral

A maioria das mudanças foi aplicada corretamente. Restam **3 problemas**, sendo 1 crítico.

## Problemas Encontrados

### 1. BUG CRITICO: `trialPriceId` fora de escopo (create-checkout)
**Arquivo:** `supabase/functions/create-checkout/index.ts`, linha 235

`trialPriceId` é declarado com `const` dentro do bloco `if (trial) { ... }` (linha 162), mas referenciado na linha 235 que está **fora** desse bloco. Isso causa `ReferenceError` em runtime quando `trial` é true, impedindo a criação de qualquer checkout de trial.

**Fix:** Mover a declaração de `trialPriceId` para antes do `if/else`, ou ajustar o log para não referenciar a variável fora do escopo. A abordagem mais limpa: declarar `let trialPriceId: string | undefined;` antes do `if (trial)` e atribuir dentro do bloco.

### 2. Backend: admin-engagement-metrics ainda usa 5 dias
**Arquivo:** `supabase/functions/admin-engagement-metrics/index.ts`, linhas 277-292

A lógica de "Active trials" e "Expired trials" usa `5 * 24 * 60 * 60 * 1000` (5 dias). O frontend já mostra "< 7d", mas o backend calcula com 5 dias — os números estão errados.

**Fix:** Trocar `5` por `7` nas linhas 278 e no comentário das linhas 277/286.

### 3. Texto: schedule-setup-reminder menciona "5 dias"
**Arquivo:** `supabase/functions/schedule-setup-reminder/index.ts`, linha 195

Mensagem de WhatsApp diz "Já se passaram 5 dias". Este texto não é sobre trial (é sobre agendamento de sessões), mas a lógica do lembrete compara 3-5 dias de inatividade no agendamento. Este caso é **cosmético e não relacionado ao trial** — a janela 3-5 dias aqui se refere ao tempo sem agendar sessões, não ao período de trial. Pode manter como está.

## O que está correto

- `create-checkout`: lógica de trial com `mode: "payment"` e price IDs por plano
- `stripe-webhook`: sem refund, sem filtro de funding, `trial_period_days: 7`, log atualizado
- `cleanup-inactive-users`: já usa 7 dias
- Frontend (`Checkout.tsx`, `Pricing.tsx`, `Hero.tsx`, `FinalCTA.tsx`, `FAQ.tsx`, `ForWho.tsx`, `Demo.tsx`, `UserGuide.tsx`, `Index.tsx`): todos atualizados
- `AdminEngagement.tsx`: labels corretas (< 7d)
- Secrets configurados corretamente

## Plano de Correção (2 mudanças)

### Passo 1 — Fix crítico: trialPriceId scoping
Em `create-checkout/index.ts`:
- Declarar `let trialPriceId: string | undefined;` antes da linha 159
- Dentro do `if (trial)`, atribuir `trialPriceId = TRIAL_PRICES[plan];`
- A referência na linha 235 passa a funcionar

### Passo 2 — admin-engagement-metrics: 5 → 7 dias
Em `admin-engagement-metrics/index.ts`:
- Linha 278: `5 * 24 * 60 * 60 * 1000` → `7 * 24 * 60 * 60 * 1000`
- Renomear variável `fiveDaysAgo` → `sevenDaysAgo`
- Atualizar comentários nas linhas 277 e 286

### Deploy
Redeploy das funções `create-checkout` e `admin-engagement-metrics`.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Fix scoping de trialPriceId |
| `supabase/functions/admin-engagement-metrics/index.ts` | 5 → 7 dias na lógica de trial |

