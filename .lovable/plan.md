

## Correção: Respostas da Aura cortadas (max_tokens muito baixo)

### Problema identificado
A última resposta da Aura ao Eduardo foi salva no banco como:
> "Oi, Eduardo! Bom dia! 💜 Olha, uma coisa legal do seu plano é que a gente tem 4"

...e parou aí. O conteúdo está truncado porque o `max_tokens` na chamada principal da API está configurado em **700**, que é insuficiente -- especialmente agora que o `finalPrompt` cresceu com os novos blocos de agenda, controle de sessão e temporal.

### Solucao

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudanca 1 - Aumentar max_tokens da chamada principal (linha 3416)**
```typescript
// De:
max_tokens: 700,
// Para:
max_tokens: 1500,
```

O valor de 1500 acomoda respostas mais completas sem ser excessivo (a Aura envia 1-4 baloes curtos, raramente passando de 800 tokens, mas o buffer evita cortes).

**Mudanca 2 - Adicionar verificacao de finish_reason (apos receber a resposta, ~linha 3420)**

Apos parsear a resposta da API, verificar se o `finish_reason` indica truncamento e logar um warning:

```typescript
const finishReason = data.choices?.[0]?.finish_reason;
if (finishReason === 'length') {
  console.warn('⚠️ Response truncated (max_tokens reached). Consider increasing max_tokens.');
}
```

Isso permite detectar futuros truncamentos nos logs sem depender de testes manuais.

### Impacto
- Corrige o problema imediato de respostas cortadas
- O log de warning permite monitorar se o limite volta a ser atingido
- O aumento de 700 para 1500 e conservador (nao gera custos significativos, pois o modelo so gera o que precisa)
