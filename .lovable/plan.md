

# Melhorias no Checkout: Trial visível + Depoimento no Stripe

## Mudança 1 — Mostrar preço do trial junto ao preço do plano

Na seção "Escolha seu plano" do `Checkout.tsx`, adicionar abaixo de cada plano uma linha mostrando o preço do trial de 7 dias. Exemplo:

```
Essencial          R$ 29,90/mês
  7 dias por R$ 6,90
```

Isso deixa claro que o usuário paga pouco para experimentar antes do preço cheio.

**Arquivo:** `src/pages/Checkout.tsx` (linhas 314-336)
- Após o nome do plano e badges, adicionar uma linha com texto como "7 dias por R$ {plan.trialPrice}" em destaque (cor primary, texto pequeno)

## Mudança 2 — Depoimento da Ana C. na página do Stripe Checkout

O Stripe Checkout permite `custom_text.submit.message` para exibir uma mensagem personalizada acima do botão de pagamento. Vamos usar o depoimento da Ana C. como social proof direto na tela de pagamento do Stripe.

**Arquivo:** `supabase/functions/create-checkout/index.ts` (dentro de `sessionConfig`, ~linha 149)
- Adicionar:
```typescript
custom_text: {
  submit: {
    message: '"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.'
  }
}
```

Isso aparece na última etapa do Stripe, acima do botão de pagar.

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Checkout.tsx` | Adicionar preço do trial abaixo de cada plano |
| `supabase/functions/create-checkout/index.ts` | Adicionar `custom_text.submit.message` com depoimento |

