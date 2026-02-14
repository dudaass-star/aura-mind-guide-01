
## Consciencia temporal server-side no aura-agent

### Problema
A Aura retoma assuntos antigos como se o tempo nao tivesse passado. Instruir isso apenas via prompt depende do modelo interpretar corretamente os timestamps - o que falha com frequencia.

### Solucao: Logica server-side deterministica

Calcular o gap temporal **no codigo TypeScript** (nao no prompt) e injetar um bloco de contexto concreto e imperativo no `finalPrompt`, com dados ja processados que o modelo so precisa seguir.

### Detalhes tecnicos

**Arquivo:** `supabase/functions/aura-agent/index.ts`

**Mudanca 1 - Extrair timestamp da ultima mensagem do usuario (apos linha ~2635)**

Antes de descartar os `created_at` no `sanitizeMessageHistory`, capturar o timestamp da mensagem mais recente do usuario:

```typescript
// Calcular gap temporal ANTES de sanitizar (pois sanitize descarta created_at)
let temporalGapHours = 0;
let lastUserMessageTime: Date | null = null;
if (messages && messages.length > 0) {
  // messages ja esta em ordem DESC aqui (antes do reverse)
  const lastUserMsg = messages.find(m => m.role === 'user');
  if (lastUserMsg?.created_at) {
    lastUserMessageTime = new Date(lastUserMsg.created_at);
    temporalGapHours = (now.getTime() - lastUserMessageTime.getTime()) / (1000 * 60 * 60);
  }
}
```

**Mudanca 2 - Injetar contexto temporal calculado no finalPrompt (apos linha ~3090)**

Adicionar um bloco **condicional** que so aparece quando o gap for >= 4 horas:

```typescript
if (temporalGapHours >= 4) {
  const gapDays = Math.floor(temporalGapHours / 24);
  const gapRemainingHours = Math.floor(temporalGapHours % 24);
  
  let gapDescription = '';
  if (gapDays >= 1) {
    gapDescription = `${gapDays} dia(s) e ${gapRemainingHours} hora(s)`;
  } else {
    gapDescription = `${Math.floor(temporalGapHours)} horas`;
  }

  let behaviorInstruction = '';
  if (temporalGapHours >= 48) {
    behaviorInstruction = `Trate como conversa NOVA. Cumprimente naturalmente para o periodo do dia. NAO retome nenhum assunto anterior a menos que o USUARIO traga primeiro.`;
  } else if (temporalGapHours >= 24) {
    behaviorInstruction = `Faz mais de um dia. Cumprimente de forma fresca. Se quiser mencionar algo anterior, diga "da ultima vez" ou "outro dia". NAO continue o assunto anterior como se fosse agora.`;
  } else {
    behaviorInstruction = `Passaram-se algumas horas. NAO retome o assunto anterior como se fosse continuacao imediata. Pergunte como o usuario esta AGORA.`;
  }

  finalPrompt += `\n\n⏰ CONTEXTO TEMPORAL (CALCULADO PELO SISTEMA - SIGA OBRIGATORIAMENTE):
Ultima mensagem do usuario foi ha ${gapDescription}.
REGRA: ${behaviorInstruction}`;
}
```

### Por que funciona melhor que no prompt

- **Deterministico**: O gap e calculado em TypeScript com `Date.getTime()`, sem depender do modelo fazer contas
- **Imperativo**: O modelo recebe uma REGRA pronta ("trate como conversa nova") em vez de ter que decidir
- **Condicional**: So aparece quando o gap e relevante (>= 4h), nao polui o prompt em conversas rapidas
- **Labels claros**: "(CALCULADO PELO SISTEMA - SIGA OBRIGATORIAMENTE)" deixa claro que nao e sugestao

### Impacto
- Zero custo extra (sem chamada adicional a API)
- Zero latencia extra (apenas calculos de Date)
- Elimina o problema de confusao temporal de forma confiavel
