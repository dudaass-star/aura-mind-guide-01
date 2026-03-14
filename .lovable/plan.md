

## Diagnóstico

Os logs da edge function mostram claramente:
1. ✅ Cliente encontrado (`cus_U8wrjaSN97Iyp3`) — a correção do telefone **funcionou**
2. ✅ Assinatura encontrada (count: 1)
3. ✅ "Returning subscription info for check"
4. ❌ ERROR: **"Invalid time value"**

O problema agora **não é mais a busca do telefone**. A função encontra o cliente e a assinatura, mas **crasha ao formatar a data** `currentPeriodEnd`. Isso acontece porque na versão `2025-08-27.basil` da API do Stripe, o campo `current_period_end` pode ter formato diferente (string ISO em vez de timestamp Unix), fazendo `new Date(value * 1000)` gerar uma data inválida.

## Correção

**Arquivo**: `supabase/functions/cancel-subscription/index.ts`

Adicionar formatação defensiva de data que funcione tanto com timestamp Unix quanto com string ISO:

```typescript
// Antes (linha 167):
const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

// Depois:
const rawEnd = subscription.current_period_end;
const currentPeriodEnd = typeof rawEnd === 'string' 
  ? new Date(rawEnd) 
  : new Date(rawEnd * 1000);
```

Aplicar a mesma lógica defensiva em todos os outros pontos do arquivo onde datas do Stripe são convertidas (linhas ~127, ~134, ~167).

Também adicionar um log do valor bruto de `current_period_end` para confirmar o formato recebido.

