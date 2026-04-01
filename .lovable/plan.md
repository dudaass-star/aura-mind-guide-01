

# Melhorias: Preço recorrente visível + Info no Stripe

## Contexto
O depoimento da Ana C. **está aparecendo** na tela do Stripe (visível no rodapé do screenshot). O que falta é informação sobre o preço recorrente após os 7 dias, tanto nos cards de plano quanto na tela do Stripe.

## Mudança 1 — Mostrar preço recorrente nos cards de plano (Checkout.tsx)
Atualmente a linha 332-334 mostra apenas "7 dias por R$ 6,90". Vamos adicionar logo abaixo o preço que será cobrado após o trial:

```
7 dias por R$ 6,90
Após: R$ 29,90/mês
```

**Arquivo:** `src/pages/Checkout.tsx` (linhas 332-334)
- Abaixo da linha "7 dias por R$ {plan.trialPrice}", adicionar texto em cinza: `Após: R$ {price}/{period}`

## Mudança 2 — Mostrar preço recorrente na tela do Stripe
Atualizar o `custom_text.submit.message` no `create-checkout` para incluir o preço pós-trial junto com o depoimento:

```
Após os 7 dias: R$ 29,90/mês. Cancele quando quiser.
"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.
```

**Arquivo:** `supabase/functions/create-checkout/index.ts` (linhas 154-158)
- Tornar a mensagem dinâmica, incluindo o preço recorrente do plano + período
- Requer mapear os preços dentro da edge function para montar a string

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Checkout.tsx` | Adicionar "Após: R$ X/mês" abaixo do preço trial nos cards |
| `supabase/functions/create-checkout/index.ts` | Incluir preço recorrente no `custom_text.submit.message` |

