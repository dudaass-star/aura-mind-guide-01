

## Mostrar o nome do plano na página de checkout do Stripe

### Problema
Hoje o checkout de trial mostra apenas "AURA — Ativação do Plano — R$1,00". O usuário não vê qual plano escolheu (Essencial, Direção ou Transformação).

### Solução
Em vez de usar o `price` fixo (`TRIAL_VALIDATION_PRICE_ID`), usar `price_data` inline no `line_items`. Isso permite personalizar o nome do produto dinamicamente com o plano escolhido.

O cliente verá algo como:
```text
AURA — Ativação do Plano Direção
R$1,00
Verificação de segurança. Valor estornado automaticamente.
```

### Detalhes técnicos

**Arquivo:** `supabase/functions/create-checkout/index.ts`

No bloco `if (trial)`, trocar:
```js
line_items: [{ price: TRIAL_VALIDATION_PRICE_ID, quantity: 1 }]
```

Por:
```js
line_items: [{
  price_data: {
    currency: 'brl',
    unit_amount: 100, // R$1,00
    product_data: {
      name: `AURA — Ativação do Plano ${planDisplayName}`,
      description: 'Verificação de segurança. Valor estornado automaticamente.',
    },
  },
  quantity: 1,
}]
```

Onde `planDisplayName` é um mapa simples:
```js
const planNames = { essencial: "Essencial", direcao: "Direção", transformacao: "Transformação" };
const planDisplayName = planNames[plan] || plan;
```

A constante `TRIAL_VALIDATION_PRICE_ID` pode ser mantida como referência mas não será mais usada no `line_items` do trial.

### Arquivos alterados
1. `supabase/functions/create-checkout/index.ts` — usar `price_data` com nome dinâmico do plano

