

## Plano: Histórico de jornadas completadas

### Problema

Não existe registro de *quais* jornadas o usuário completou — apenas um contador (`journeys_completed`). Por isso o portal não consegue mostrar jornadas passadas.

### Solução

1. **Criar tabela `user_journey_history`** para armazenar cada jornada completada
2. **Registrar conclusões** no momento em que acontecem (a partir de agora)
3. **Mostrar no portal** as jornadas com histórico, com todos os episódios acessíveis

### Mudanças

| Componente | Ação |
|---|---|
| Migration SQL | Criar tabela `user_journey_history` (user_id, journey_id, completed_at) com RLS para portal tokens |
| `supabase/functions/periodic-content/index.ts` | No trecho que completa a jornada (~linha 210), inserir registro na `user_journey_history` |
| `supabase/functions/choose-next-journey/index.ts` | Verificar se já insere histórico (provavelmente não) — adicionar insert se necessário |
| `src/pages/UserPortal.tsx` | JornadasTab: buscar `user_journey_history` do usuário, mostrar jornadas completadas com todos episódios desbloqueados + jornada atual com progresso parcial |

### Detalhes técnicos

**Tabela:**
```sql
CREATE TABLE public.user_journey_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  journey_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_journey_history ENABLE ROW LEVEL SECURITY;
-- Portal token holders can read
CREATE POLICY "Portal token holders can read journey history"
  ON public.user_journey_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_portal_tokens WHERE user_portal_tokens.user_id = user_journey_history.user_id));
-- Service role full access
CREATE POLICY "Service role full access"
  ON public.user_journey_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**Portal (JornadasTab):**
- Buscar `user_journey_history` WHERE user_id = userId
- Jornadas com registro no histórico: mostrar como "Completada" com todos episódios clicáveis
- Jornada atual (`current_journey_id`): mostrar com progresso parcial (episódios até `current_episode` desbloqueados)
- Jornadas sem histórico e que não são a atual: não mostrar

