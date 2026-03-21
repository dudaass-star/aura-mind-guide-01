

# Fix: Aura assume peso emocional em mensagens leves

## Correções (2 alterações no mesmo arquivo)

### 1. Contexto temporal sem viés emocional (linha 3819)

A instrução para gap de 4-24h diz "Pergunte como o usuario esta AGORA" — o modelo interpreta como convite para sondagem emocional. Trocar para tom neutro:

**Antes:**
```
Passaram-se algumas horas. NAO retome o assunto anterior como se fosse continuacao imediata. Pergunte como o usuario esta AGORA.
```

**Depois:**
```
Passaram-se algumas horas. NAO retome o assunto anterior como se fosse continuacao imediata. Cumprimente de forma natural e leve. NAO assuma que algo esta errado — espere o usuario trazer o assunto.
```

### 2. Neutralizar fallbacks emocionais (linhas 4240-4254)

Remover frases pesadas como "isso é pesado", "O que tá sentindo agora?", "o que tá por baixo disso?" dos arrays de fallback.

**Session fallbacks — substituir por:**
```typescript
const sessionFallbacks = [
  `${fallbackNamePrefix}hmm, me conta mais sobre isso.`,
  `Hmm. Me conta mais sobre como isso aparece no seu dia a dia.`,
  `${fallbackNamePrefix}fica comigo — e o que mais tá rolando?`,
  `Entendi. E aí, como você tá com isso?`,
  `${fallbackNamePrefix}isso importa. Me conta mais sobre ${recentThemeName || 'isso'}.`,
  `Hmm... faz sentido. Me fala mais.`,
];
```

**Casual fallbacks — substituir por:**
```typescript
const casualFallbacks = [
  `${fallbackNamePrefix}tô processando isso aqui. Me conta mais.`,
  `Hmm... e o que mais tá passando pela sua cabeça?`,
  `Entendi. E aí, tudo bem?`,
  `${fallbackNamePrefix}isso ficou aqui comigo. Me conta mais sobre ${recentThemeName || 'isso'}.`,
  `Sério? Me fala mais.`,
  `Hmm. Faz sentido. E aí?`,
];
```

## Arquivo editado
- `supabase/functions/aura-agent/index.ts` (2 alterações)

## Resultado esperado
- Gap temporal não força sondagem emocional
- Fallbacks usam tom neutro e curioso em vez de assumir peso

