

## Análise das Considerações Adicionais

### 1. `FOR UPDATE SKIP LOCKED` -- CONCORDO, essencial para concorrência

A observação é precisa. Mesmo com cron de 5 minutos, atrasos ou sobreposições podem causar duas execuções simultâneas pegando as mesmas tasks.

**Solução**: Criar uma função RPC no Postgres que faz o claim atômico:

```sql
CREATE OR REPLACE FUNCTION claim_pending_tasks(max_tasks INT DEFAULT 150)
RETURNS SETOF scheduled_tasks
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE scheduled_tasks
  SET status = 'executing'
  WHERE id IN (
    SELECT id FROM scheduled_tasks
    WHERE status = 'pending' AND execute_at <= now()
    ORDER BY execute_at ASC
    LIMIT max_tasks
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
```

A edge function chama `supabase.rpc('claim_pending_tasks', { max_tasks: 150 })` e recebe apenas tasks que nenhum outro processo está tocando. Zero duplicidade, mesmo sob concorrência.

---

### 2. Aumentar limite de 50 para 150 -- CONCORDO

A matemática é simples:
- 150 tasks × 300ms delay = **45 segundos** de processamento
- Timeout da edge function = **120+ segundos**
- Margem de segurança confortável

Com `FOR UPDATE SKIP LOCKED`, não há risco de duplicidade mesmo com limite maior. Isso elimina o gargalo nos horários de pico (09:00, 22:00).

**Limite revisado: 150 tarefas por ciclo.**

---

### Plano final consolidado (todas as considerações incorporadas)

#### Migração SQL
1. Tabela `scheduled_tasks` com colunas: `id`, `user_id`, `execute_at`, `task_type`, `payload`, `status`, `created_at`, `executed_at`
2. Índice parcial: `CREATE INDEX idx_scheduled_tasks_pending ON scheduled_tasks (execute_at) WHERE status = 'pending'`
3. Função RPC `claim_pending_tasks` com `FOR UPDATE SKIP LOCKED` e limite default 150
4. RLS: service_role full access + users can view own

#### Prompt do `aura-agent`
- Tag `[AGENDAR_TAREFA:YYYY-MM-DD HH:mm:tipo:descricao]`
- Tag `[CANCELAR_TAREFA:tipo]`
- Instruções de quando usar cada tag

#### Processamento no `webhook-zapi`
- Detectar `[AGENDAR_TAREFA:...]` → montar payload padronizado → insert
- Detectar `[CANCELAR_TAREFA:...]` → buscar próxima pendente (`ORDER BY execute_at ASC LIMIT 1`) → marcar `cancelled`

#### Edge function `execute-scheduled-tasks`
- Chama RPC `claim_pending_tasks(150)` (atômico, skip locked)
- Processa com delay de 300ms entre envios
- Marca individualmente como `executed` ou `failed`
- Safety net: tasks em `executing` há >10 min são resetadas para `pending`

#### Cron
- `*/5 * * * *` via `pg_cron` + `pg_net`

