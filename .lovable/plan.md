

# Colocar o preço mensal no painel verde do Stripe

## Problema
O `product_data.description` não está aparecendo no painel verde como esperado. Apenas o `name` aparece de forma confiável no sidebar do Stripe Checkout.

## Solução
Incluir o preço mensal diretamente no campo `product_data.name`, que é o texto garantido no painel verde. E mover o depoimento + "CANCELE QUANDO QUISER" para a `description` (que aparece logo abaixo).

**Arquivo:** `supabase/functions/create-checkout/index.ts`

Linha 190-191, trocar:
```typescript
name: `AURA ${planDisplayName} — 7 dias`,
description: `Após o período de teste: R$ ${displayPrice}/${periodLabel}. CANCELE QUANDO QUISER.`,
```

Para:
```typescript
name: `AURA ${planDisplayName} — 7 dias | Após: R$ ${displayPrice}/${periodLabel}`,
description: `CANCELE QUANDO QUISER. "Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
```

Resultado no painel verde:
- **Nome**: "AURA Direção — 7 dias | Após: R$ 49,90/mês"
- **Descrição**: "CANCELE QUANDO QUISER..." + depoimento
- **Preço**: R$ 9,90

E simplificar o `custom_text.submit.message` (rodapé branco) para algo curto como "Pagamento único de teste. Sem compromisso." — ou removê-lo completamente, já que toda a informação importante estará no verde.

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Mover preço mensal para o `name` do produto, depoimento para `description`, simplificar rodapé |

