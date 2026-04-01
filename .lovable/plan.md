

# Ajuste limpo no Stripe Checkout

## Estratégia
- **Painel verde**: Mostrar nome do plano + preço mensal na descrição (limpo, informativo)
- **Rodapé (submit)**: Depoimento da Ana C. + "CANCELE QUANDO QUISER" (prova social + segurança)

## Mudança técnica

**Arquivo:** `supabase/functions/create-checkout/index.ts`

Na seção de trial (linha ~184-185), trocar de price ID estático para `price_data` com descrição customizada:

```typescript
const trialAmounts: Record<string, number> = {
  essencial: 690,
  direcao: 990,
  transformacao: 1990,
};

sessionConfig.line_items = [{
  price_data: {
    currency: 'brl',
    unit_amount: trialAmounts[plan],
    product_data: {
      name: `AURA ${planDisplayName} — 7 dias`,
      description: `Após o período de teste: R$ ${displayPrice}/${periodLabel}`,
    },
  },
  quantity: 1,
}];
```

E simplificar o `custom_text.submit.message`:
```typescript
custom_text: {
  submit: {
    message: `CANCELE QUANDO QUISER.\n"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
  },
},
```

Resultado visual no Stripe:
- **Painel verde**: "AURA Direção — 7 dias" + "Após o período de teste: R$ 49,90/mês" + R$ 9,90
- **Rodapé**: "CANCELE QUANDO QUISER" + depoimento

Também preciso corrigir o build error atual antes de aplicar.

## Arquivo modificado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-checkout/index.ts` | `price_data` com descrição do preço mensal no painel verde, rodapé simplificado |

