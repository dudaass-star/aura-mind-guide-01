

# Trial Pago + Checkout com Prova Social

## Estratégia

Substituir o modelo atual (R$1 validação + reembolso + filtro de cartão) por um **trial pago de 7 dias** com preços por plano. Isso elimina a fricção do reembolso e filtra cartões sem saldo naturalmente. Além disso, aquecer a página de checkout com depoimento e garantia antes do botão de pagamento.

## Preços do Trial

| Plano | Trial 7 dias | Após trial |
|---|---|---|
| Essencial | R$ 6,90 | R$ 29,90/mês ou R$ 214,90/ano |
| Direção | R$ 9,90 | R$ 49,90/mês ou R$ 359,90/ano |
| Transformação | R$ 19,90 | R$ 79,90/mês ou R$ 574,90/ano |

## Mudanças

### 1. Criar 3 produtos/prices no Stripe (one-time)
- "AURA — 7 dias Essencial" → R$ 6,90 (BRL, one-time)
- "AURA — 7 dias Direção" → R$ 9,90
- "AURA — 7 dias Transformação" → R$ 19,90

### 2. `create-checkout/index.ts`
- Quando `trial: true`, usar `mode: "payment"` com o price_id do trial correspondente ao plano
- Remover a lógica de `price_data` com R$1,00 hardcoded
- Manter `setup_future_usage: 'off_session'` para salvar o cartão
- **Remover filtro de cartão de crédito** — aceitar qualquer cartão (a cobrança real já filtra saldo)
- Manter metadata com `trial_validation: "true"` para o webhook saber que é trial

### 3. `stripe-webhook/index.ts`
- Na seção `trial_validation`:
  - **Remover** toda a lógica de reembolso do R$1
  - **Remover** a verificação de `card.funding` (crédito vs débito) — não é mais necessário pois a cobrança real já valida saldo
  - Manter a criação da subscription com `trial_period_days: 7` (mudar de 5 para 7)
  - Manter criação de perfil, welcome message, CAPI event

### 4. `src/pages/Checkout.tsx` — Prova social + garantia
- Adicionar **bloco de depoimento** acima do botão de pagamento:
  > *"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia. Hoje não consigo imaginar meu dia sem a AURA."* — Ana C.
- Adicionar **garantia de satisfação**: "Se nos primeiros 7 dias você não sentir diferença, devolvemos seu dinheiro. Sem perguntas."
- Atualizar textos:
  - "Começar 5 dias grátis" → "Começar por R$ X,XX"
  - "Hoje: R$ 0,00" → "Hoje: R$ X,XX"
  - "Primeira cobrança em 5 dias" → "Após 7 dias: R$ {preço}/{período}"
  - Remover menções a "grátis" no checkout
- Mostrar preço do trial dinamicamente conforme o plano selecionado

### 5. `src/components/Pricing.tsx` + `FinalCTA.tsx` + `Hero.tsx`
- Atualizar referências de "5 dias grátis" → "7 dias por R$ 6,90" (ou preço dinâmico)
- Trust badges: "5 dias grátis pra começar" → "Experimente por 7 dias"
- CTA do FinalCTA: "Experimentar 5 dias grátis" → "Começar por R$ 6,90"

### 6. Secrets
- Salvar os 3 price IDs do trial como secrets:
  - `STRIPE_PRICE_ESSENCIAL_TRIAL`
  - `STRIPE_PRICE_DIRECAO_TRIAL`
  - `STRIPE_PRICE_TRANSFORMACAO_TRIAL`

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Usar price do trial, remover hardcoded R$1 |
| `supabase/functions/stripe-webhook/index.ts` | Remover reembolso e filtro de funding, trial 7 dias |
| `src/pages/Checkout.tsx` | Depoimento, garantia, preços trial dinâmicos |
| `src/components/Pricing.tsx` | Textos "7 dias por R$6,90" |
| `src/components/FinalCTA.tsx` | CTA atualizado |
| `src/components/Hero.tsx` | Textos trial atualizados |
| `src/components/FAQ.tsx` | Atualizar FAQ sobre trial |

## Detalhes técnicos

- O fluxo permanece `mode: "payment"` com `setup_future_usage` para salvar o cartão
- A subscription com `trial_period_days: 7` continua sendo criada no webhook após o pagamento
- A diferença é que o pagamento agora é **real** (R$6,90-19,90) e **não é reembolsado**
- Cartões sem saldo falham naturalmente no Stripe — sem necessidade de filtro manual
- O trial de 7 dias começa após a subscription ser criada (a primeira cobrança real do plano acontece no 8º dia)

