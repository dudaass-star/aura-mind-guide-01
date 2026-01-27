
## Mover Price IDs do Stripe para Secrets

### Situação Atual
Os Price IDs estão hardcoded no arquivo `create-checkout/index.ts`:

```typescript
const PRICES = {
  essencial: {
    monthly: "price_1SlEYjHMRAbm8MiTB689p4b6",  // Sandbox
    yearly: "price_1Sn2oPHMRAbm8MiTh68EoqzT",
  },
  // ...
};
```

### Objetivo
Mover esses IDs para variáveis de ambiente (secrets) para trocar facilmente entre sandbox e produção.

### Estrutura de Secrets Proposta

Criar 6 secrets no formato:

| Secret Name | Descrição | Valor Sandbox |
|-------------|-----------|---------------|
| `STRIPE_PRICE_ESSENCIAL_MONTHLY` | Essencial mensal | `price_1SlEYjHMRAbm8MiTB689p4b6` |
| `STRIPE_PRICE_ESSENCIAL_YEARLY` | Essencial anual | `price_1Sn2oPHMRAbm8MiTh68EoqzT` |
| `STRIPE_PRICE_DIRECAO_MONTHLY` | Direção mensal | `price_1SlEb6HMRAbm8MiTz4H3EBDT` |
| `STRIPE_PRICE_DIRECAO_YEARLY` | Direção anual | `price_1Sn2pAHMRAbm8MiTaVR3LOsm` |
| `STRIPE_PRICE_TRANSFORMACAO_MONTHLY` | Transformação mensal | `price_1SlEcKHMRAbm8MiTLWgfYHAV` |
| `STRIPE_PRICE_TRANSFORMACAO_YEARLY` | Transformação anual | `price_1Sn2psHMRAbm8MiTV25S7DCi` |

### Alterações no Código

#### Arquivo: `supabase/functions/create-checkout/index.ts`

**Antes:**
```typescript
const PRICES: Record<string, { monthly: string; yearly: string }> = {
  essencial: {
    monthly: "price_1SlEYjHMRAbm8MiTB689p4b6",
    yearly: "price_1Sn2oPHMRAbm8MiTh68EoqzT",
  },
  // ...
};
```

**Depois:**
```typescript
const getPrices = (): Record<string, { monthly: string; yearly: string }> => ({
  essencial: {
    monthly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY") || "",
  },
  direcao: {
    monthly: Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY") || "",
  },
  transformacao: {
    monthly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY") || "",
  },
});
```

Adicionar validação:
```typescript
const PRICES = getPrices();

if (!priceId) {
  throw new Error("Price ID not configured for this plan");
}
```

### Fluxo para Trocar de Ambiente

```text
┌─────────────────────────────────────────────────────────────┐
│                   TROCA DE AMBIENTE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SANDBOX → PRODUÇÃO:                                        │
│  1. Atualizar STRIPE_SECRET_KEY → sk_live_...               │
│  2. Atualizar STRIPE_WEBHOOK_SECRET → whsec_... (live)      │
│  3. Atualizar os 6 STRIPE_PRICE_* → price_... (live)        │
│                                                             │
│  PRODUÇÃO → SANDBOX:                                        │
│  1. Reverter STRIPE_SECRET_KEY → sk_test_...                │
│  2. Reverter STRIPE_WEBHOOK_SECRET → whsec_... (test)       │
│  3. Reverter os 6 STRIPE_PRICE_* → price_... (test)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Benefícios
- Zero alteração de código para trocar ambientes
- Mais seguro (IDs não ficam no repositório)
- Fácil rollback entre sandbox e produção
- Padrão consistente com STRIPE_SECRET_KEY

### Passos de Implementação

1. **Solicitar os 6 secrets** usando a ferramenta de adicionar secrets
2. **Modificar** `create-checkout/index.ts` para ler das variáveis de ambiente
3. **Adicionar validação** para garantir que os Price IDs estão configurados
4. **Testar** o checkout após as mudanças
