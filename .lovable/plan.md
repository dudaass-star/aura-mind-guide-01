

# Correção de Duplicatas de Commitments — Plano Revisado

## Mudanças vs plano anterior

1. **Match por 40 caracteres** em vez de 20 — evita falsos positivos em frases que começam igual ("conversar com a esposa sobre X" vs "conversar com a esposa sobre Y")
2. **Verificação prévia antes da migration** — rodar SELECT de diagnóstico antes de deletar
3. **Instrução de prompt específica** — texto exato para prevenir na origem

## Implementação

### 1. Deduplicação no backend — `aura-agent/index.ts`

No bloco `COMPROMISSO_LIVRE` (linha ~4660), antes do insert:

```typescript
const titlePrefix = title.substring(0, 40);
const { data: existing } = await supabase
  .from('commitments')
  .select('id, title')
  .eq('user_id', profile.user_id)
  .eq('completed', false)
  .ilike('title', `%${titlePrefix}%`)
  .limit(1);

if (existing && existing.length > 0) {
  console.log('📋 Skipping duplicate commitment:', title, '(matches:', existing[0].title, ')');
} else {
  await supabase.from('commitments').insert({...});
  console.log('📋 Free commitment created:', title);
}
```

Mesma lógica no bloco `COMPROMISSO_RENEGOCIADO` (linha ~4636).

### 2. Instrução no prompt da Aura

Adicionar ao bloco de instruções de tags:

> Se `[COMPROMISSO_LIVRE:texto]` já aparece na lista de compromissos pendentes do contexto dinâmico, NÃO re-emita a tag. O sistema já registrou — emitir novamente cria duplicata.

O contexto dinâmico já inclui `pendingCommitmentsDetailed.map(c => c.title).join(', ')` (linha 3640), então a Aura já tem a informação para decidir.

### 3. Limpeza de duplicatas existentes

Primeiro, verificar o que seria afetado (query de diagnóstico):

```sql
SELECT user_id, title, count(*), min(created_at), max(created_at)
FROM commitments
WHERE completed = false
GROUP BY user_id, title
HAVING count(*) > 1;
```

Depois, deletar mantendo o mais recente de cada grupo:

```sql
DELETE FROM commitments
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, title) id
  FROM commitments
  ORDER BY user_id, title, created_at DESC
)
AND completed = false
AND title IN (
  SELECT title FROM commitments
  WHERE completed = false
  GROUP BY user_id, title
  HAVING count(*) > 1
);
```

## Arquivos alterados
- `supabase/functions/aura-agent/index.ts` — deduplicação backend + instrução no prompt
- Operação de dados (insert tool) — limpeza de duplicatas

