

## O que aconteceu

A Aura parou de responder porque existe **mais um erro de variável indefinida** no código do `aura-agent`. Quando você trocou o modelo, o edge function foi reiniciado e o erro apareceu:

```
ReferenceError: audioSessionContext is not defined (linha 3262)
```

Isso **não tem relação com o modelo Flash Low em si** -- é o mesmo tipo de bug das correções anteriores: a variável `audioSessionContext` foi perdida durante a refatoração do `Promise.allSettled`. Ela é usada no template do prompt (linha 3262) mas nunca é declarada.

O modelo anterior provavelmente também teria falhado se o edge function fosse reiniciado. A troca de modelo apenas forçou um novo deploy/boot que expôs o erro.

## Correção

**Arquivo**: `supabase/functions/aura-agent/index.ts`

Inserir a construção da variável `audioSessionContext` logo após a linha 3235 (`const dateTimeContext = ...`), antes do bloco `dynamicContext`:

```typescript
const sessionAudioCount = currentSession?.audio_sent_count || 0;
const audioSessionContext = sessionActive
  ? (sessionAudioCount < 2
    ? `SESSÃO ATIVA — OBRIGATÓRIO usar [MODO_AUDIO] nas primeiras 2 respostas da sessão (áudios enviados: ${sessionAudioCount}). Cria intimidade e presença.`
    : `SESSÃO ATIVA — Áudio já foi usado no início. Use texto normalmente, exceto em momentos de encerramento ou crise.`)
  : 'Fora de sessão — use áudio apenas quando o usuário pedir ou em situações de crise emocional.';
```

Isso reconstrói a lógica de controle de áudio que já existia e resolve o crash. A Aura volta a responder com qualquer modelo.

