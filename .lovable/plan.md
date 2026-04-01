

# Separar depoimento do "CANCELE QUANDO QUISER"

## Problema
Na `description` do produto, "CANCELE QUANDO QUISER" e o depoimento estão na mesma linha, ficando visualmente confuso.

## Solução
Separar em dois parágrafos usando `\n\n` no campo `description`. O Stripe renderiza quebras de linha em descrições de produto.

**Arquivo:** `supabase/functions/create-checkout/index.ts` (linha 191)

De:
```typescript
description: `CANCELE QUANDO QUISER. "Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
```

Para:
```typescript
description: `CANCELE QUANDO QUISER.\n\n"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
```

**Nota:** O Stripe Checkout renderiza texto puro — não suporta negrito/bold em `description`. A separação por parágrafo (`\n\n`) e as aspas do depoimento já criam destaque visual suficiente. Se o Stripe não renderizar a quebra de linha, a alternativa é mover o depoimento para o `custom_text.submit.message` (rodapé branco) e deixar apenas "CANCELE QUANDO QUISER." na description.

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Adicionar `\n\n` entre "CANCELE QUANDO QUISER" e o depoimento |

