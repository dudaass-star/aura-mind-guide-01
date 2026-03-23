

# Plano: Ressalva de contexto no bloco USUÁRIO NOVO (sem conflito com Topic Shift)

## Análise do risco levantado

O risco de "achar que tem contexto por causa de mensagens antigas" **não se aplica** porque:

- **Topic Shift** (L886-894) faz early return antes de chegar ao bloco de usuário novo — usuários existentes que mudam de tema **sempre** recebem guidance de mapeamento
- **Bloco Usuário Novo** (L1034) só executa para `<15 msgs` e `0 insights` — são usuários na primeira conversa, sem temas anteriores
- A heurística de caracteres mediria apenas mensagens da conversa atual

## Implementação (sem mudança no plano original)

### Arquivo: `supabase/functions/aura-agent/index.ts` (~L1034-1038)

Substituir o return simples do bloco de usuário novo por lógica condicional:

```typescript
if ((totalMessageCount ?? Infinity) < 15 && (insightsCount ?? Infinity) === 0) {
  const userMsgs = recentUser; // já disponível no escopo
  const totalChars = userMsgs.reduce((sum, m) => sum + m.length, 0);
  const hasDetailedContext = totalChars > 250 || userMsgs.some(m => m.length > 150);
  
  if (hasDetailedContext) {
    return { 
      guidance: `🆕 USUÁRIO NOVO COM CONTEXTO:
O usuário já trouxe detalhes sobre a situação. NÃO pergunte "o que está acontecendo".
1. Mostre que entendeu, resumindo brevemente o que ele trouxe
2. Valide o ato de compartilhar
3. Aprofunde a partir do que ele JÁ disse`, 
      detectedPhase: 'initial', 
      stagnationLevel: 0 
    };
  }
  
  return { guidance: null, detectedPhase: 'initial', stagnationLevel: 0 };
}
```

**Impacto**: ~12 linhas alteradas no bloco existente. Sem risco de conflito com Topic Shift.

