

# Correção: Variável `currentMonth` duplicada no aura-agent

## O que aconteceu
A integração do Inworld TTS criou uma segunda declaração `const currentMonth` na linha 4864, conflitando com a já existente na linha 2684. Isso causa um `BOOT_ERROR` que impede a Aura de responder qualquer mensagem.

## Correção

No arquivo `supabase/functions/aura-agent/index.ts`, renomear a segunda ocorrência:

| Linha | Antes | Depois |
|-------|-------|--------|
| 4864 | `const currentMonth = new Date()...` | `const currentAudioMonth = new Date()...` |
| 4866 | `currentMonth !== resetMonth` | `currentAudioMonth !== resetMonth` |
| 5095 | `currentMonth !== resetMonth` | `currentAudioMonth !== resetMonth` |

São apenas 3 linhas alteradas. O agente volta a funcionar imediatamente após o deploy.

