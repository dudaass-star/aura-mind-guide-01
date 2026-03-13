

# Limite de retomadas por sessão (máx. 3)

## Problema
Uma sessão pode ser retomada infinitamente — cada gap >2h reseta o relógio para +20 min. Um usuário que volta a cada 8h poderia manter a mesma sessão ativa por dias.

## Mudanças

### 1. Novo campo `resumption_count` na tabela `sessions`
Migração SQL para adicionar coluna com default 0:
```sql
ALTER TABLE public.sessions ADD COLUMN resumption_count integer NOT NULL DEFAULT 0;
```

### 2. Incrementar contador no `aura-agent` quando detectar retomada
No bloco onde `isResuming = true` é detectado (~linha 2780), após confirmar que é uma retomada, incrementar o contador no banco:
```typescript
await supabase.from('sessions')
  .update({ resumption_count: (currentSession.resumption_count || 0) + 1 })
  .eq('id', currentSession.id);
```

### 3. Forçar encerramento quando `resumption_count >= 3`
Na detecção de retomada, se o contador já é >= 3:
- Não tratar como `isResuming` — manter `isOvertime = true`
- Instruir a Aura a encerrar esta sessão e sugerir agendar uma nova
- O `timeContext` incluirá: "Esta sessão já foi retomada 3 vezes. Proponha encerrar e agendar uma nova sessão."

### 4. Passar `resumption_count` para `calculateSessionTimeContext`
Adicionar parâmetro opcional `resumptionCount` à função. Quando `resumptionCount >= 3` e gap >2h, não ativar `isResuming` — manter comportamento de overtime com instrução de encerramento (mas sem auto-end forçado, seguindo a regra atual).

## Fluxo

```text
Retomada 1: gap >2h → isResuming=true, +20 min, counter=1
Retomada 2: gap >2h → isResuming=true, +20 min, counter=2  
Retomada 3: gap >2h → isResuming=true, +20 min, counter=3
Retomada 4: gap >2h → isResuming=false, overtime, Aura propõe encerrar
```

## Arquivos alterados
- **Migração SQL**: adicionar `resumption_count` à tabela `sessions`
- **`supabase/functions/aura-agent/index.ts`**: 3 pontos — buscar o count, passar para `calculateSessionTimeContext`, incrementar no banco

