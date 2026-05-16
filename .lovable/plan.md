# Corrigir race do convite D0 (caso Lorena)

## Problema

O bloco D0 injetor (`aura-agent/index.ts` linha ~5610) ignora corretamente turnos onde `message` é clique de botão ("Começar", "Bora", "Sim"…), mantendo `pending_first_session_invite=true` para a próxima msg real.

Mas o bloco de **limpeza pós-processamento** (linha ~6413) **não tem essa proteção**: se a Aura não emitiu `[AGENDAR_SESSAO]` neste turno, ele assume recusa e zera a flag — mesmo quando o turno foi um button click paralelo gerado pelo próprio "Começar". Resultado: o convite D0 nunca chega a ser injetado quando o usuário escreve a 1ª msg real, e o fluxo cai no setup mensal genérico.

## Correção

No bloco `else if (typeof message === 'string')` da linha ~6413 em `supabase/functions/aura-agent/index.ts`, adicionar guard idêntico ao do injetor:

```ts
const _msgNormPost = String(message || '').trim().toLowerCase();
const _looksLikeButtonClickPost =
  _msgNormPost.length > 0 &&
  _msgNormPost.length <= 12 &&
  /^(come[çc]ar|bora|sim|ok|acessar|ver|abrir|resumo|conte[úu]do|jornada)\.?!?$/i.test(_msgNormPost);

if (_looksLikeButtonClickPost) {
  console.log('🎯 D0: turno é button click — mantendo flag pendente para próxima msg real');
  // pula limpeza, mantém pending_first_session_invite=true
} else {
  // ... toda a lógica atual de recusa/captura de horário/limpeza
}
```

Mantém intacta a lógica de aceite (`scheduleMatch` na linha 6402): se a Aura emitiu tag, limpa a flag normalmente.

## Validação

1. Query antes/depois para medir o impacto histórico:
   ```sql
   -- Trials últimos 7 dias que perderam o convite D0
   SELECT COUNT(*) FROM profiles
   WHERE created_at >= now() - interval '7 days'
     AND status = 'trial'
     AND pending_first_session_invite = false
     AND first_session_invite_attempts = 0
     AND needs_schedule_setup = true;
   ```
2. Após deploy: monitorar `failed_message_log` por 24h e confirmar que novos trials que clicam "Começar" entram no D0 binário (sessão imediata ou recusa explícita), não no setup mensal.

## Atualização de memória

Atualizar `mem://features/sessions/first-session-invite-d0` com a nota:

> **Race do limpador (16/05/2026 — Lorena P Marques Chaves):** O guard `_looksLikeButtonClick` precisa existir nos DOIS pontos: injetor (linha ~5610) e limpador pós-processamento (linha ~6413). Sem o guard no limpador, qualquer turno paralelo gerado pelo clique "Começar" queima a flag antes da 1ª msg real do usuário, e o fluxo cai no setup mensal em vez do D0 binário.

## Arquivos afetados

- `supabase/functions/aura-agent/index.ts` (1 bloco condicional adicionado, ~10 linhas)
- `mem/features/sessions/first-session-invite-d0.md` (nota de incidente)

## Fora de escopo

- Reabrir o convite D0 para Lorena manualmente (caso pontual — pode ser feito separado com mensagem proativa se quisermos recuperá-la)
- Refatorar a detecção de button clicks para um helper compartilhado (não urgente)
