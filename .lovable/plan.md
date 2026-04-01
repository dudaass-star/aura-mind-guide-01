

# Destacar Trial + Preço Mensal no Stripe

## Duas mudanças solicitadas:

### 1. Cards de plano (Checkout.tsx) — Inverter destaque
Atualmente o preço grande no canto direito é o mensal (R$ 29,90/mês). O usuário quer que o preço do trial (7 dias) seja o mais destacado, e o mensal fique menor/secundário.

**Arquivo:** `src/pages/Checkout.tsx`

- **Preço grande (canto direito):** Trocar de `R$ {price}/{period}` para `R$ {plan.trialPrice}` com label "7 dias"
- **Preço pequeno abaixo:** Mostrar `Após: R$ {price}/{period}` em texto menor e cinza
- **Remover** as linhas 332-337 (trial price e "Após" duplicados no bloco da esquerda), já que essa info vai para o lado direito

Resultado visual:
```text
Essencial                    R$ 6,90
  Chat ilimitado              7 dias
                         Após: R$ 29,90/mês
```

### 2. Tela do Stripe (create-checkout) — Já tem o preço mensal
A linha 156 já inclui `"Após os 7 dias: R$ 29,90/mês. Cancele quando quiser."` no `custom_text.submit.message`. Os preços na linha 149-152 podem estar desatualizados vs. os planos reais. Vou verificar e corrigir se necessário (Transformação mostra 99,90 mas no frontend é 79,90).

**Arquivo:** `supabase/functions/create-checkout/index.ts`
- Corrigir `transformacao.monthly` de `"99,90"` para `"79,90"`
- Corrigir `transformacao.yearly` de `"958,80"` para `"574,90"`
- Corrigir `essencial.yearly` de `"286,80"` para `"214,90"`
- Corrigir `direcao.yearly` de `"478,80"` para `"359,90"`

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Checkout.tsx` | Destacar preço trial como principal, mensal como secundário |
| `supabase/functions/create-checkout/index.ts` | Corrigir preços no `custom_text` |

