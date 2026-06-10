# Plano: Atualizar memória de roteamento de modelos

## Contexto
A `system_config` no banco de dados está sobrescrevendo o modelo padrão do código (`google/gemini-2.5-pro`) com `google/gemini-3-flash-preview`. Isso significa que **todas** as requisições do `aura-agent` — sessões ativas, conversas casuais e Instagram — estão usando Flash 3 Preview, não Pro.

A memória do projeto ainda descreve o roteamento híbrido original (Pro para sessões, Flash para casual), o que pode confundir futuras sessões de desenvolvimento.

## Mudanças

### 1. Atualizar `mem://index.md` (Core rule — linha 5)
De:
```
- **AI Roster**: Gemini 2.5 Pro for Sessions. Gemini 2.5 Flash for casual chat & Instagram. Gemini 2.5 Flash-Lite for extractors/tags.
```
Para:
```
- **AI Roster**: Gemini 3 Flash Preview para tudo (sessões, casual chat, Instagram). Roteamento híbrido Pro/Flash temporariamente suspenso. Gemini 2.5 Flash-Lite para extractors/tags.
```

### 2. Atualizar `mem://technical/ai/hybrid-model-routing`
Substituir o conteúdo atual (que descreve Pro para sessões) por uma nota factual sobre o estado atual:
```
A `system_config` sobrescreve o modelo padrão do código com `google/gemini-3-flash-preview`, portanto todas as requisições do aura-agent usam Flash 3 Preview atualmente — incluindo sessões ativas, conversas casuais e Instagram.

O roteamento híbrido original (Gemini 2.5 Pro para sessões ativas, Flash para casual) está suspenso. A decisão de mantê-lo suspenso foi tomada para reduzir complexidade e custo enquanto se avalia se o Flash 3 Preview entrega profundidade investigativa suficiente para sessões.

Se houver evidência pós-deploy das 8 remoções de que o Flash 3 Preview fica raso demais em sessões, reativar o roteamento híbrido é a correção natural.
```

## Fora de escopo
- Nenhuma mudança de código no `aura-agent` ou em `system_config`.
- Nenhuma alteração no modelo real em produção (continua Flash 3 Preview).
- Extractors/tags continuam em Flash-Lite (não afetado por esta mudança).