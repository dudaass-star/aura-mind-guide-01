

## Plano: Janela de 2h para lógica temporal

### Arquivo
`supabase/functions/aura-agent/index.ts` — linhas 3237-3241

### Mudança
Substituir o cálculo atual do `temporalGapHours` por uma versão que também verifica a última mensagem da Aura:

```typescript
// Antes (linhas 3237-3241):
const lastUserMsg = messages.find((m: any) => m.role === 'user');
if (lastUserMsg?.created_at) {
  const lastUserMessageTime = new Date(lastUserMsg.created_at);
  temporalGapHours = (Date.now() - lastUserMessageTime.getTime()) / (1000 * 60 * 60);
}

// Depois:
const lastUserMsg = messages.find((m: any) => m.role === 'user');
const lastAuraMsg = messages.find((m: any) => m.role === 'assistant');

const userGapMs = lastUserMsg?.created_at 
  ? Date.now() - new Date(lastUserMsg.created_at).getTime() 
  : Infinity;
const auraGapMs = lastAuraMsg?.created_at 
  ? Date.now() - new Date(lastAuraMsg.created_at).getTime() 
  : Infinity;

// Se a Aura enviou mensagem nas últimas 2h, usar o gap dela
// (evita tratar como "conversa nova" quando a Aura acabou de falar)
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
if (auraGapMs < TWO_HOURS_MS) {
  temporalGapHours = auraGapMs / (1000 * 60 * 60);
} else {
  temporalGapHours = userGapMs / (1000 * 60 * 60);
}
```

### Por que funciona
- `messages` já vem ordenado por `created_at desc`, então `.find()` pega a mais recente de cada role
- Se a Aura mandou "Bom dia" às 09:00 e o usuário responde às 09:26, o `auraGapMs` é ~26min → `temporalGapHours ≈ 0.43` → nenhuma instrução de "cumprimente de forma fresca" é injetada
- Se a Aura mandou uma meditação à noite e o usuário fala de manhã (gap > 2h), volta ao comportamento atual baseado no gap do usuário

### Impacto
- 1 bloco de código alterado (~10 linhas)
- Zero risco para fluxos existentes
- Resolve saudações duplicadas após qualquer mensagem proativa recente

