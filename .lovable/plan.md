

## Opções para resolver UX sem perder validação de saldo

### Contexto
A cobrança de R$1 existe para pegar cartões sem saldo antes do trial começar. O trial nativo do Stripe (R$0) não faz isso. Precisamos de uma solução que mantenha a validação de saldo mas melhore a UX.

### Opção recomendada: Manter R$1, melhorar a apresentação no Stripe

Em vez de mudar toda a arquitetura, podemos simplesmente renomear o produto/preço no Stripe para algo menos estranho.

**O que mudar:**
1. Criar um novo Price no Stripe com nome do produto mais amigável, por exemplo:
   - Nome do produto: "AURA — Ativação do Plano"
   - Descrição: "Verificação de segurança. Valor estornado automaticamente."
2. Atualizar o `TRIAL_VALIDATION_PRICE_ID` no `create-checkout/index.ts` com o novo price ID

**Resultado para o cliente:**
Em vez de ver "Validação de cartão AURA — R$1,00", veria algo como:
```
AURA — Ativação do Plano
R$1,00
Verificação de segurança. Valor estornado automaticamente.
```

### Alternativa: Cobrar o valor real do primeiro mês com trial embutido

Outra opção seria cobrar o valor cheio (ex: R$49,90) na hora, e dar os 5 dias de trial como "período de garantia" — se cancelar em 5 dias, estorna tudo. Mas isso muda bastante a lógica e o apelo comercial do trial grátis.

### Recomendação

Manter o R$1 + estorno (validação forte) e apenas melhorar o nome/descrição do produto no Stripe. É a mudança mais simples e preserva toda a blindagem que já construímos.

### Arquivos alterados
- `supabase/functions/create-checkout/index.ts` — trocar o `TRIAL_VALIDATION_PRICE_ID` pelo novo price ID (após criar o produto no Stripe)

