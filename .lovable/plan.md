

# Ajustes na Tela do Stripe Checkout

## Problema
1. O painel verde (esquerdo) do Stripe mostra apenas "R$ 9,90 — 7 dias de acesso ao plano Direção da AURA" mas **não mostra o valor mensal** que será cobrado após o trial.
2. O depoimento da Ana C. aparece no rodapé (cinza, pouco visível) e deveria aparecer no **painel verde** para ter mais destaque.

## Solução

### Arquivo: `supabase/functions/create-checkout/index.ts`

**Mudança 1 — Adicionar preço mensal na descrição do produto (painel verde)**

Atualmente a linha 185 usa `{ price: trialPriceId, quantity: 1 }` que puxa a descrição do produto cadastrado no Stripe. Para adicionar o preço mensal, vamos usar `price_data` com `product_data` que permite customizar a descrição exibida no painel verde:

```typescript
sessionConfig.line_items = [{
  price_data: {
    currency: 'brl',
    unit_amount: trialAmounts[plan], // 690, 990, 1990
    product_data: {
      name: `AURA — 7 dias ${planDisplayName}`,
      description: `7 dias de acesso ao plano ${planDisplayName} da AURA. Após o trial: R$ ${displayPrice}/${periodLabel}.`,
    },
  },
  quantity: 1,
}];
```

Isso faz o painel verde mostrar o preço recorrente junto com a descrição do trial.

**Mudança 2 — Mover depoimento para o painel verde**

O Stripe Checkout `custom_text.submit` aparece acima do botão "Pagar" (na área branca). Para colocar o depoimento no painel verde, usamos `custom_text.after_submit` não — na verdade, não existe opção nativa para texto no painel verde.

A alternativa é incluir o depoimento na `description` do `product_data`, que aparece no painel verde:

```typescript
description: `7 dias de acesso ao plano ${planDisplayName}. Após: R$ ${displayPrice}/${periodLabel}.\n\n"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
```

E simplificar o `custom_text.submit` para mostrar apenas a garantia:

```typescript
custom_text: {
  submit: {
    message: `Garantia de 7 dias. Cancele quando quiser.`,
  },
},
```

**Mudança 3 — Mapear valores do trial em centavos**

Adicionar um mapa de valores em centavos para usar com `price_data`:

```typescript
const trialAmounts: Record<string, number> = {
  essencial: 690,
  direcao: 990,
  transformacao: 1990,
};
```

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Usar `price_data` com `product_data.description` para mostrar preço mensal e depoimento no painel verde |

