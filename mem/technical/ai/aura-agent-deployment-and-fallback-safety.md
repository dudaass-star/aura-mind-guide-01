---
name: Deploy do aura-agent e segurança de fallbacks
description: Drift entre repo e produção do aura-agent + padrão obrigatório de try/catch em fallbacks opcionais
type: preference
---

## Drift de deploy

Commits do Lovable em `supabase/functions/**` **podem não disparar** automaticamente o workflow `.github/workflows/deploy-functions.yml`. Isso já causou ~17h de silêncio para uma usuária (08/05/2026, caso Luana — `meditationCatalog is not defined` em produção mesmo com fix no repo).

**Como aplicar:**
- Depois de qualquer mudança no `aura-agent` (ou em `_shared/`), validar em até 5 min com:
  ```sql
  select created_at, left(error,200) from failed_message_log
  where created_at > now() - interval '10 minutes'
  order by created_at desc;
  ```
- Se houver suspeita de drift: usar `supabase--deploy_edge_functions(["aura-agent"])` para republicar manualmente.
- O workflow agora aceita `workflow_dispatch` — pode ser disparado manualmente também.

### Sintoma diagnóstico — D0 não disparado

Quando o injetor D0 está fora do deploy, 100% dos novos usuários ficam com `profiles.first_session_invite_attempts = 0` mesmo depois de mandarem mensagens reais — porque o counter é incrementado **antes** da chamada ao LLM (linhas 5615-5619). Query rápida:
```sql
select name, created_at, pending_first_session_invite, first_session_invite_attempts
from profiles
where created_at > now() - interval '24 hours'
order by created_at desc;
```
Se vários perfis recentes têm `attempts=0` com `pending=false`, é drift confirmado. Caso 16/05/2026: ALAN, Andressa, Herony e Fernanda criados no mesmo dia, todos com `attempts=0`. Redeploy do `aura-agent` resolveu.

## Padrão obrigatório: try/catch em fallbacks opcionais

Qualquer bloco dentro do `aura-agent` que seja **opcional** (fallback de meditação, fallback de tag, recuperação de erro de extractor, etc.) deve estar isolado em `try/catch` próprio com `console.warn` — nunca pode derrubar a resposta principal da Aura.

**Por quê:** o caso Luana foi um `ReferenceError` em fallback de meditação que retornou HTTP 500 e silenciou a usuária por 17h. Com `try/catch`, o pior cenário vira "fallback não rodou" em vez de "Aura sumiu".

**Como aplicar:**
- Code review: qualquer PR que adicione bloco `if (!xxxMatch && ...)` ou similar exige try/catch ao redor.
- Logar com `console.warn('⚠️ [<nome-fallback>] skipped due to error (non-fatal):', err)` para que apareça em logs sem virar erro fatal.