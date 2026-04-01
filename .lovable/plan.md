

# Separar depoimento do "CANCELE QUANDO QUISER"

## Problema
O Stripe Checkout ignora `\n\n` no campo `description` do `product_data` — tudo continua na mesma linha no painel verde.

## Solução
Separar os dois textos em locais diferentes do Stripe Checkout:

- **`product_data.description`** (painel verde): apenas `"CANCELE QUANDO QUISER."`
- **`custom_text.submit.message`** (rodapé branco, acima do botão Pagar): o depoimento `"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`

Isso garante separação visual real, já que são áreas distintas da página.

## Mudança técnica

**Arquivo:** `supabase/functions/create-checkout/index.ts`

1. **Linha 166** — trocar o `custom_text.submit.message`:
```typescript
message: `"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
```

2. **Linha 191** — simplificar a `description`:
```typescript
description: `CANCELE QUANDO QUISER.`,
```

**Resultado visual:**
- Painel verde: Nome do plano + preço + "CANCELE QUANDO QUISER."
- Rodapé branco (acima do botão Pagar): depoimento da Ana C.

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Depoimento vai pro `custom_text.submit`, description fica só com "CANCELE QUANDO QUISER." |

