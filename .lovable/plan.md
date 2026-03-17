

## Plano: Migrar trial sem cartão para trial 7 dias com cartão via Stripe

### Como funciona

O formulário `/experimentar` continua coletando nome, email e WhatsApp. Ao submeter, chama `create-checkout` com `trial: true`, que cria uma sessão Stripe com `trial_period_days: 7` no plano Essencial. O cliente é redirecionado ao Stripe, cadastra o cartão, e volta para `/obrigado`. O webhook cria o perfil com `status: 'trial'` e envia a mensagem de boas-vindas.

Se cancelar nos 7 dias: nenhuma cobrança acontece. Dia 8: cobra automaticamente.

### Mudanças

**1. `create-checkout` edge function** — aceitar `trial: true`
- Quando `trial: true`: forçar `plan: 'essencial'`, `billing: 'monthly'`
- Adicionar `subscription_data.trial_period_days: 7`
- `cancel_url` aponta para `/experimentar` (não `/checkout`)

**2. `stripe-webhook` — detectar trial**
- No `checkout.session.completed`: verificar se subscription tem `trial_end`
- Se trial ativo: criar perfil com `status: 'trial'` ao invés de `'active'`
- Mensagem de boas-vindas igual ao fluxo normal (já funciona)

**3. `StartTrial.tsx` — redirecionar para Stripe Checkout**
- Submit chama `create-checkout` com `{ plan: 'essencial', trial: true, name, email, phone }`
- Redireciona para `data.url` (Stripe Checkout)
- Atualizar copy:
  - Badge: "100% Grátis" → "7 dias grátis"
  - Benefícios: "Sem cartão" → "Cancele quando quiser", "Sem prazo" → "Sem cobrança por 7 dias"
  - Botão: "Começar Grátis" → "Começar 7 dias grátis"
  - Subtítulo: "sem compromisso" → "sem cobrança nos primeiros 7 dias"

**4. Landing page — atualizar copy em 6 arquivos**

| Arquivo | De | Para |
|---------|-----|------|
| `Hero.tsx` | "Começar Grátis" / "5 conversas grátis. Sem cartão." | "Experimentar 7 dias grátis" / "Sem cobrança nos primeiros 7 dias" |
| `FinalCTA.tsx` | "5 conversas grátis + Sem cartão" | "7 dias grátis — cancele antes de ser cobrado" |
| `ForWho.tsx` | "5 conversas. Sem cartão." | "7 dias grátis. Cancele quando quiser." |
| `Pricing.tsx` | "5 conversas grátis pra começar" | "7 dias grátis pra começar" |
| `FAQ.tsx` | "5 conversas grátis... sem cartão" | "7 dias grátis com cartão, cancele a qualquer momento" |
| `Demo.tsx` | já atualizado ("7 dias grátis") | manter |

**5. `TrialStarted.tsx`** — não será mais usado no fluxo (Stripe redireciona para `/obrigado`). Manter a rota por retrocompatibilidade.

### O que NÃO muda
- `start-trial` edge function: mantida (retrocompatibilidade com usuários existentes)
- `ThankYou.tsx`: já funciona com `session_id` do Stripe
- Webhook de cancelamento/reativação
- Fluxo de checkout direto (`/checkout`)

### Arquivos editados
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `src/pages/StartTrial.tsx`
- `src/components/Hero.tsx`
- `src/components/FinalCTA.tsx`
- `src/components/ForWho.tsx`
- `src/components/Pricing.tsx`
- `src/components/FAQ.tsx`

### Deploy
- `create-checkout`
- `stripe-webhook`

