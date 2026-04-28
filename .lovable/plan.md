# Plano: Evitar que commitments alimentem insistência da Aura

## Problema
Hoje o post-analysis cria commitments a cada turno sem deduplicar e sem detectar recusa. Quando o usuário recusa um tópico, a recusa vira mais um commitment "pendente", reforçando o bloco "padrão recorrente" no próximo prompt → Aura insiste.

## Solução (mínima, 1 lugar só)

### 1. Cleanup retroativo (SQL)
Marcar como `cancelled` os 9 commitments pendentes do Eduardo (`329ebadd-07eb-4e1e-88db-d8974b2ea3e5`) que mencionam "sessão/sessões/agendar".

### 2. Auto-cancel por recusa no `post-analysis`
No `supabase/functions/aura-agent/index.ts`, dentro do bloco de post-analysis (Flash-lite), adicionar uma instrução curta no prompt do extractor:

> "Se a última mensagem do usuário expressa recusa, desinteresse ou pedido para parar (ex: 'não quero', 'já disse que não', 'para de insistir', 'não tenho interesse') sobre um tópico que existe em commitments pendentes, retorne um campo `cancel_topics: string[]` com palavras-chave do(s) tópico(s) recusado(s)."

Depois do parse, se `cancel_topics.length > 0`:
```ts
await supabase
  .from('commitments')
  .update({ commitment_status: 'cancelled', completed: true })
  .eq('user_id', userId)
  .eq('commitment_status', 'pending')
  .or(cancel_topics.map(t => `title.ilike.%${t}%,description.ilike.%${t}%`).join(','));
```

### 3. Deduplicação leve na criação
Antes de inserir um novo commitment, checar se já existe um pendente com `title` similar (ilike) nos últimos 7 dias. Se sim, pular insert (ou incrementar `follow_up_count`).

## O que NÃO vamos fazer
- Não mexer em estrutura do prompt principal
- Não criar novos campos/tabelas
- Não tocar no Phase Evaluator nem no fluxo de memória

## Resultado esperado
- Recusa explícita → commitments do tópico viram `cancelled` no mesmo turno
- Bloco "padrão recorrente" para de listar tópico recusado
- Aura para de insistir naturalmente
- Custo: ~25 linhas de código em 1 arquivo + 1 UPDATE retroativo

## Memória a salvar (após implementação)
`mem://features/commitments/auto-cancel-on-refusal` — descrevendo a regra de cancelamento por recusa e dedupe de 7 dias.
