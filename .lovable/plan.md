

## Análise: Caso Glaudia — Resposta desproporcional ao CVV

### O que aconteceu

A Glaudia estava desabafando sobre o filho que trouxe uma mulher da Indonésia, se sente impotente e disse frases como "prefiro morrer do que ver meu filho indo pro abismo" e "gostaria de partir mesmo". Isso é **ideação passiva** — expressão de dor extrema, não plano concreto de suicídio.

A AURA respondeu bem inicialmente (acolheu, perguntou sobre rede de apoio), mas na segunda menção ("gostaria de partir") mandou direto pro CVV 188. Isso deu a sensação de "largou a mão dela".

### Causa raiz

Dois problemas:

1. **`isCrisis()` (detecção determinística)** — A lista de frases inclui termos amplos demais como `'quero morrer'` e `'acabar com tudo'` que capturam ideação passiva junto com ideação ativa. "Prefiro morrer" casa parcialmente.

2. **System prompt** — Embora diga "só encaminhe em CASOS DE VIDA OU MORTE" e "plano concreto de suicídio", a IA não tem orientação clara sobre como lidar com ideação passiva. Falta um bloco intermediário que diga "acolha, aprofunde, e continue presente".

### Plano de correção

**1. Refinar `isCrisis()` — separar emergência real de ideação passiva**

- Criar duas funções: `isLifeThreatening()` (plano concreto) e `isEmotionalCrisis()` (ideação passiva)
- `isLifeThreatening`: "vou me matar", "comprei remédios", "vou pular", "tenho um plano" → encaminha ao CVV
- `isEmotionalCrisis`: "quero morrer", "prefiro morrer", "partir", "acabar com tudo", "desistir de viver" → NÃO encaminha, sinaliza para a IA acolher com profundidade

**2. Atualizar system prompt — adicionar bloco de "Crise Emocional (NÃO é emergência)"**

Adicionar entre os blocos 1 e 2 do protocolo de segurança:

```
**1.5 CRISE EMOCIONAL (IDEAÇÃO PASSIVA — NÃO ENCAMINHE):**
- Frases como: "prefiro morrer", "quero partir", "desisti de viver", 
  "não vejo sentido", "seria melhor se eu não existisse"
- Isso é EXPRESSÃO DE DOR, não plano concreto
- Ação: Acolha profundamente. Valide a dor. Pergunte o que está por trás. 
  Continue presente. NÃO mande pro CVV. NÃO diga "procure ajuda profissional".
  A pessoa está pedindo para ser ouvida, não para ser descartada.
- Exemplo: "Eu ouço você, e essa dor é real. Você não precisa carregar isso 
  sozinha. Me conta mais — o que tá mais pesado agora?"
```

**3. Ajustar a lista de `isCrisis()` para remover termos de ideação passiva**

Remover da lista: `'quero morrer'`, `'acabar com tudo'`
Manter apenas gatilhos de risco real: `'me matar'`, `'suicídio'`, `'vou me matar'`

### Arquivos afetados
1. `supabase/functions/aura-agent/index.ts` — função `isCrisis()` + system prompt (protocolo de segurança)

### Resultado esperado
- Ideação passiva → AURA acolhe, aprofunda, fica presente
- Emergência real (plano concreto) → AURA encaminha ao CVV 188
- Nunca mais "larga a mão" de alguém que só precisa ser ouvida

