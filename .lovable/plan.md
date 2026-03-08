

# Fix: Verificacao do roteamento Claude + Log de modelo

## Situacao atual

Os logs mostram apenas a chamada anterior (17:07, "Oi Aura") que usou Gemini Pro (antes da troca de modelo). Nao ha logs de uma nova mensagem apos a troca para Claude.

O log na linha 3691 diz `"Calling Lovable AI with..."` independentemente do modelo — isso e enganoso quando o modelo e Anthropic.

## Correcao proposta

1. **Alterar o log na linha 3691** do `aura-agent/index.ts` para incluir o modelo configurado:
   - De: `"Calling Lovable AI with", apiMessages.length, "messages, plan:"`
   - Para: `"Calling AI (model: " + configuredModel + ") with", apiMessages.length, "messages, plan:"`

2. **Adicionar log na funcao `callAI`** para confirmar qual rota foi tomada:
   - Se Anthropic: `console.log('🔀 Routing to Anthropic API, model:', anthropicModel)`
   - Se Gateway: `console.log('🔀 Routing to Lovable AI Gateway, model:', model)`

Isso permitira confirmar nos logs se o roteamento esta funcionando corretamente quando voce enviar a proxima mensagem.

## Arquivos alterados
- `supabase/functions/aura-agent/index.ts` (2 pontos: callAI + log principal)

