

## Efeito Oráculo — Plano de Implementação

### 1. Migration: adicionar coluna ao profiles

```sql
ALTER TABLE public.profiles 
ADD COLUMN last_proactive_insight_at timestamptz DEFAULT NULL;
```

### 2. Nova Edge Function: `pattern-analysis/index.ts`

**Lógica principal:**

1. Busca usuários ativos com telefone, `status = 'active'`, `created_at` > 14 dias, e `last_proactive_insight_at` null ou > 7 dias atrás
2. Filtra: quiet hours (22h-08h BRT), DND, conversa recente (<2h via `messages`)
3. Agrupa por instância WhatsApp para anti-burst paralelo
4. Para cada usuário, coleta:
   - Top 20 `user_insights` (todas categorias, ordenado por importance)
   - Últimos 10 `checkins`
   - `session_themes` ativos
   - Últimas 20 `messages` (resumo role+content)
5. Chama Lovable AI Gateway (`google/gemini-2.5-flash`) com **tool calling estruturado**:
   - Tool `proactive_insight` com schema: `{ status: "SEND"|"SKIP", reasoning: string, whatsapp_message: string }`
   - Mini-persona AURA no system prompt (~200 palavras): tom acolhedor, usa nome, emoji moderado, máx 3 parágrafos
   - Prompt holístico: exercício, alimentação, sono, lazer, socialização, natureza, criatividade, descanso — qualquer dimensão que faça sentido
   - Instrução explícita de SKIP se dados insuficientes, momento delicado, ou nada específico
6. Se `status === "SEND"`: envia via `sendTextMessage` com config da instância, salva em `messages`, atualiza `last_proactive_insight_at`
7. Anti-burst delay entre envios por instância

**Controles de segurança:**
- IA pode vetar com SKIP (sem envio)
- Máximo 1x/semana por usuário
- Quiet hours + DND respeitados
- Não envia se última mensagem do usuário foi há <2h (conversa ativa)
- dry_run mode para testes

### 3. Config

Adicionar ao `config.toml`:
```toml
[functions.pattern-analysis]
verify_jwt = false
```

### 4. Cron Job

SQL via insert tool (não migration) para agendar quintas 14:00 UTC (11h BRT):
```sql
SELECT cron.schedule(
  'weekly-pattern-analysis',
  '0 14 * * 4',
  $$ SELECT net.http_post(...) $$
);
```

Requer extensões `pg_cron` e `pg_net` habilitadas.

### Resumo de arquivos

| Ação | Arquivo |
|------|---------|
| Migration | `last_proactive_insight_at` no profiles |
| Criar | `supabase/functions/pattern-analysis/index.ts` |
| Editar | `supabase/config.toml` (nova entrada) |
| SQL (insert) | Cron job semanal |

