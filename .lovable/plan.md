# Correções: Rating pós-sessão + Sessões duplicadas

## Problema 1 — Rating de 1 a 5 nunca é enviado

**Causa raiz:** O `aura-agent` envia o resumo imediatamente ao encerrar a sessão e marca `post_session_sent = true`. O `session-reminder` filtra por `post_session_sent = false`, então **nunca processa essas sessões** e a pergunta "De 1 a 5..." não chega ao usuário. Confirmado nas 5 sessões de hoje (Fabiana, Luana, Jéssica, Suelly, Tamara) — nenhuma recebeu o rating.

**Correção (Opção C com fallback):**

Em `supabase/functions/session-reminder/index.ts`:

1. **Trocar o filtro** da query de `completedSessions` (linha 573-578):
   - Remover `.eq('post_session_sent', false)`
   - Adicionar `.eq('rating_requested', false)`
   - Selecionar também `post_session_sent` na query
   - Manter `.lte('ended_at', fiveMinutesAgo)` para garantir o atraso de 5 min (tempo do session-extractor rodar)

2. **Lógica condicional de envio** (linhas 656-714):
   - Se `session.post_session_sent === true` → Aura já mandou o resumo. Enviar **apenas** o `ratingMessage`.
   - Se `session.post_session_sent === false` → fallback: Aura falhou. Enviar resumo + delay 2s + ratingMessage (fluxo atual).
   - Em ambos os casos, ao final, marcar `rating_requested = true` e `post_session_sent = true`.

3. **Manter** a criação dos `commitments` follow-up (linhas 680-697) só no caminho de fallback (quando o resumo é enviado pelo session-reminder), pois no caminho feliz isso já deve ser tratado em outro fluxo. Verificar se hoje a criação de commitments depende exclusivamente desse bloco — se sim, mover para fora do `if` e rodar sempre que `rating_requested` for marcado.

## Problema 2 — Sessões duplicadas (caso Luana)

**Causa raiz:** A Aura emitiu `[AGENDAR_SESSAO]` em duas mensagens consecutivas (14:14 e 14:18 BRT). O `aura-agent` (linha 6313) faz `INSERT` direto em `sessions` sem verificar duplicatas próximas. Resultado: duas sessões `scheduled` para a mesma usuária com 4 min de diferença, ambas iniciadas e concluídas em paralelo.

**Correção em duas camadas:**

### Camada 1 — Guarda no código (`aura-agent`)

Antes do `INSERT` em `sessions` (linha 6313 e linha 6450), adicionar verificação:

- Buscar sessões existentes do usuário com `status IN ('scheduled', 'active')` cujo `scheduled_at` esteja dentro de **±30 minutos** do novo `scheduledAt`.
- Se encontrar: logar warning, pular o INSERT e (no caso de [AGENDAR_SESSAO]) reusar a sessão existente para o `[SESSION_PREARM]` se aplicável.

Aplicar a mesma guarda no loop de `[CRIAR_AGENDA]` (linha 6450).

### Camada 2 — Constraint no banco (defense-in-depth)

Criar índice único parcial em `sessions`:

```sql
CREATE UNIQUE INDEX idx_sessions_no_duplicate_scheduled
ON public.sessions (user_id, date_trunc('hour', scheduled_at))
WHERE status IN ('scheduled', 'active');
```

Isso impede duas sessões agendadas/ativas para o mesmo usuário na mesma janela de hora. Se o INSERT colidir, o erro será capturado pelo bloco `if (!sessionError)` que já existe.

> Nota: `date_trunc` em índice exige função `IMMUTABLE`. Caso o Postgres reclame, alternativa é gerar coluna `scheduled_at_hour` via `GENERATED ALWAYS AS (date_trunc('hour', scheduled_at)) STORED` e indexar nela.

## Arquivos afetados

- `supabase/functions/session-reminder/index.ts` — query e lógica condicional do post-session
- `supabase/functions/aura-agent/index.ts` — guarda anti-duplicação nos dois pontos de INSERT
- Nova migração SQL — índice único parcial em `sessions`

## Validação pós-deploy

1. Aguardar próxima sessão real concluída → confirmar nos logs do `session-reminder` que o rating foi enviado.
2. Confirmar no DB que `session_ratings` recebe nova entrada quando a usuária responder "1" a "5".
3. Tentar agendar duas sessões manualmente próximas via Aura → confirmar que a segunda é bloqueada com warning.

## Fora do escopo

- Limpeza retroativa da sessão duplicada da Luana (pode ser feita manualmente depois se quiser).
- Mudança no prompt da Aura para evitar emitir `[AGENDAR_SESSAO]` duas vezes — o fix de banco/código já elimina o sintoma.
