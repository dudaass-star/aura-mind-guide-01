

# Plano: Guidance de mapeamento situacional após Topic Shift

## Problema
Quando um usuário existente muda de tema, o Phase Evaluator reseta para Presença (L886-891) mas não injeta nenhuma guidance de mapeamento. Após 5 trocas, o evaluator empurra para Sentido — mesmo que a AURA não tenha explorado o que está por trás do novo tema.

## Solução
Modificar o return do Topic Shift (L890) para injetar uma guidance leve de mapeamento, além do streak nudge já existente.

### Arquivo: `supabase/functions/aura-agent/index.ts`

**Mudança no bloco Topic Shift (L886-891):**

Adicionar guidance ao return quando topic_continuity é `shifted` ou `new_topic`:

```typescript
const topicShiftGuidance = `\n\n🔄 MUDANÇA DE TEMA DETECTADA:
O usuário trouxe um assunto novo. Antes de interpretar ou aprofundar emocionalmente:
1. Acolha brevemente o que ele trouxe
2. Pergunte sobre a SITUAÇÃO concreta: "O que tá acontecendo?" / "Me conta mais sobre isso"
3. Só após entender o contexto, aplique as fases normais`;

return { 
  guidance: (streakNudge || '') + topicShiftGuidance, 
  detectedPhase: 'initial', 
  stagnationLevel: 0 
};
```

**Impacto**: ~5 linhas alteradas. Sem mudança estrutural. A guidance é injetada apenas na troca imediata após a detecção de mudança de tema — nas trocas seguintes, o evaluator volta ao fluxo normal.

