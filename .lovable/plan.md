

## Plano: Desconto 40% nos anuais + PIX + badge de lançamento

### Preços corrigidos (40% off)

| Plano | Mensal | Anual 12x | Anual -40% | Equiv/mês | Equiv/dia |
|-------|--------|-----------|------------|-----------|-----------|
| Essencial | R$ 29,90 | R$ 358,80 | **R$ 214,90** | R$ 17,91 | ~R$ 0,59 |
| Direção | R$ 49,90 | R$ 598,80 | **R$ 359,90** | R$ 29,99 | ~R$ 0,99 |
| Transformação | R$ 79,90 | R$ 958,80 | **R$ 574,90** | R$ 47,91 | ~R$ 1,57 |

### O que será feito

**1. Stripe — criar 6 novos preços**
- 3 preços recorrentes anuais (cartão, `mode: subscription`) com os valores acima
- 3 preços one-time (PIX, `mode: payment`) com os mesmos valores
- Atualizar secrets `STRIPE_PRICE_*_YEARLY` para os novos IDs de cartão
- Criar novos secrets `STRIPE_PRICE_*_PIX_YEARLY` para os IDs PIX

**2. `Pricing.tsx` — atualizar preços + badge**
- Atualizar `yearlyPrice`, `yearlyMonthlyEquivalent`, `yearlyDiscount` (40), `dailyPrice.yearly` nos 3 planos
- Adicionar badge "Oferta de lançamento" visível quando `billingPeriod === "yearly"`

**3. `Checkout.tsx` — atualizar preços + adicionar toggle PIX**
- Espelhar os novos preços anuais (214,90 / 359,90 / 574,90)
- Quando `billingPeriod === "yearly"`: mostrar toggle "Cartão" / "PIX"
- Submit envia `paymentMethod: 'pix'` quando PIX selecionado

**4. `create-checkout` edge function — suportar PIX**
- Aceitar parâmetro `paymentMethod: 'pix' | 'card'`
- Quando PIX + yearly: `mode: 'payment'`, `payment_method_types: ['pix']`, usar Price IDs PIX
- Quando cartão: fluxo atual sem mudanças

**5. `stripe-webhook` — tratar pagamento único PIX**
- No `checkout.session.completed`: detectar `session.mode === 'payment'` e metadata `payment_method: 'pix'`
- Criar/atualizar perfil com `status: 'active'` e `plan_expires_at` = hoje + 12 meses
- Mesma lógica de boas-vindas

**6. Migração de banco**
- Adicionar coluna `plan_expires_at` (timestamp, nullable) na tabela `profiles`

### Arquivos editados
- `src/components/Pricing.tsx`
- `src/pages/Checkout.tsx`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- Migração SQL (nova coluna)
- 6 novos preços Stripe + 3 novos secrets

