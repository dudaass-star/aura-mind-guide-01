## Problema
Hoje a coluna **D0** só reflete o funil do convite (concluído = "fluxo encerrou", não "sessão aconteceu"). Não dá pra:
1. Saber se a pessoa fez sessão de verdade, quantas, quando foi a última
2. Distinguir **sessão completa** vs **sessão abandonada no meio** (sinal direto de qualidade)
3. Detectar facilmente sessões feitas que **não capturaram rating** (bug atual)

Tudo isso já está nas tabelas `sessions` e `session_ratings` — só falta exibir.

## Solução (sem mudança de schema, agregação derivada)

### Classificação de sessão (derivada em tempo de query)

| Categoria | Regra |
|---|---|
| **Concluída** | `status='completed'` AND `ended_at IS NOT NULL` |
| **Abandonada** | `started_at IS NOT NULL` AND `ended_at IS NULL` AND `(scheduled_at + duration_minutes + 30min) < now()` AND `status != 'completed'` |
| **Em andamento** | `status='in_progress'` ou dentro da janela ativa |
| **Agendada (futura)** | `status='scheduled'` AND `scheduled_at > now()` |
| **No-show** | `status='scheduled'` AND `started_at IS NULL` AND `scheduled_at + 1h < now()` |

### Novas colunas em `/admin/users`

| Coluna | Conteúdo | Exemplo |
|---|---|---|
| **Sessões** (substitui posição da D0) | `concluídas · abandonadas · no-show / agendadas` | `3·1·0 / 5` |
| **Última sessão** | data relativa + ícone do desfecho | `há 2d ✅` / `há 5d ⚠️ abandonada` |
| **Rating médio** (substitui Rating atual) | média ⭐ + capturados / concluídas | `⭐ 4.5 (2/3)` |
| **D0** (mantida menor) | só como filtro de funil de aquisição | `Concluído` |

### Sinais visuais
- **Abandonada > 0** → badge âmbar **"⚠️ N abandonadas"** (clicável → abre detalhe)
- **No-show ≥ 2** → vermelho (problema de comprometimento)
- **Última sessão > 14 dias** → cinza (risco churn)
- **Concluídas > 0 sem nenhum rating** → ícone ⚠️ "rating não capturado" (ajuda QA do bug)
- **Rating médio < 3** → vermelho

### Filtros novos (dropdown)
- "Com sessão abandonada"
- "Com no-show"
- "Sessão concluída sem rating"
- "Rating médio ≤ 3"

### Drill-down (modal de detalhe)
Ao clicar em **"⚠️ N abandonadas"** abre lista com, por sessão:
- Quando iniciou / quando parou de responder
- Última mensagem do usuário antes de sumir (preview)
- Qual era a fase (Presença / Reframe / Fechamento) — derivado de `key_insights`/`session_summary` se houver
- Botão "Ver conversa" → leva pra `/admin/messages?userId=…&from=…&to=…`

Isso permite responder: **"abandonou porque ficou ruim, porque foi interrompida, ou porque a Aura travou?"**

## Implementação

### 1. Edge function `admin-users-list` (nova)
Query agregada por perfil, paginada:
```sql
SELECT p.*,
  COUNT(*) FILTER (WHERE s.status='completed') AS sessions_done,
  COUNT(*) FILTER (WHERE s.started_at IS NOT NULL
                   AND s.ended_at IS NULL
                   AND s.status NOT IN ('completed','scheduled')
                   AND s.scheduled_at + (s.duration_minutes||' min')::interval + interval '30 min' < now()) AS sessions_abandoned,
  COUNT(*) FILTER (WHERE s.status='scheduled' AND s.started_at IS NULL
                   AND s.scheduled_at + interval '1 hour' < now()) AS sessions_noshow,
  COUNT(*) FILTER (WHERE s.status='scheduled' AND s.scheduled_at > now()) AS sessions_upcoming,
  MAX(s.ended_at)   FILTER (WHERE s.status='completed') AS last_completed_at,
  MAX(s.started_at) FILTER (WHERE s.ended_at IS NULL)   AS last_abandoned_at,
  AVG(r.rating)::numeric(2,1) AS rating_avg,
  COUNT(r.id)               AS ratings_count
FROM profiles p
LEFT JOIN sessions s        ON s.user_id = p.user_id
LEFT JOIN session_ratings r ON r.user_id = p.user_id
GROUP BY p.id
```

### 2. `src/pages/AdminUsers.tsx`
- Substituir coluna **Rating** por **Rating médio (capturados/concluídas)**
- Adicionar **Sessões** (concluídas · abandonadas · no-show / agendadas) e **Última sessão** entre Status e D0
- Reduzir D0 a badge compacto
- Adicionar 4 filtros novos
- Modal drill-down ao clicar no badge de abandonadas

### 3. Sem migration, sem alteração no código de conversa/aura-agent

## Por que essa é a melhor opção
- **Diagnóstico de qualidade**: você bate o olho e sabe se as sessões estão sendo ABANDONADAS (= qualidade) ou só não rolando (= adoção/agenda)
- **Zero risco**: dado já existe, sem migration, sem mexer em flow crítico
- **Detecta o bug de rating em 1 filtro**: "Concluída sem rating"
- **Investigação rápida**: drill-down abre direto a conversa do momento do abandono
