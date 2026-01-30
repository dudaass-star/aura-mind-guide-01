

# Plano: Regenerar Áudio com Voz Mais Natural

## Problema Identificado

O áudio atual está:
- **Muito rápido** (speakingRate 1.20)
- **Robótico** (stylePrompt pode não estar adequado para frases curtas)

## Ajustes Propostos

### Parâmetros de Voz

| Parâmetro | Valor Atual | Novo Valor |
|-----------|-------------|------------|
| speakingRate | 1.20 | **1.05** |
| stylePrompt | Genérico | **Otimizado para pergunta curta** |

### Novo StylePrompt

```text
Fale de forma calorosa e genuinamente curiosa, como uma amiga próxima 
fazendo uma pergunta com interesse real. Tom suave, ritmo tranquilo, 
pausas naturais. Sem pressa. Voz acolhedora e presente.
```

## Alterações Técnicas

### Arquivo: `supabase/functions/generate-demo-audio/index.ts` (temporário)

Recriar a edge function com os novos parâmetros:
- Voz: **Erinome** (mantém)
- Modelo: **gemini-2.5-pro-tts** (mantém)
- speakingRate: **1.05** (mais lento)
- stylePrompt: **Otimizado para curiosidade genuína**
- Texto: "E o que você desenha? Me conta mais sobre isso."

## Execução

1. Criar edge function com parâmetros ajustados
2. Deploy e executar
3. Verificar qualidade do novo áudio
4. Cleanup (remover função temporária)

## Resultado Esperado

Voz mais lenta, natural e acolhedora — como a AURA realmente soa numa conversa real, demonstrando curiosidade genuína pela resposta da usuária.

