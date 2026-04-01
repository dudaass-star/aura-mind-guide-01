

# Ajustar mensagem no Stripe Checkout

## Mudança

**Arquivo:** `supabase/functions/create-checkout/index.ts` (linha 156 e 164-168)

Trocar a mensagem do `custom_text.submit.message` de:

```
Após os 7 dias: R$ 29,90/mês. Cancele quando quiser.
"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.
```

Para:

```
Após os 7 dias: R$ 29,90/mês. CANCELE QUANDO QUISER.
"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.
```

- Remover "Garantia de 7 dias" (se existir em qualquer parte)
- Destacar "CANCELE QUANDO QUISER" em caixa alta para dar ênfase
- Manter o depoimento da Ana C. e o preço recorrente

## Arquivo modificado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | Remover "garantia" e destacar "CANCELE QUANDO QUISER" em caixa alta |

