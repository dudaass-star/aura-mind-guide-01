---
name: Snapshots temáticos (Linha do Tempo Emocional)
description: Tabela thematic_snapshots + cron mensal + citação literal validada por substring; portal e carta consomem, chat NÃO consome na v1
type: feature
---

**Objetivo:** transformar o saldo emocional em história ancorada por tema, com citação **literal e datada** do usuário. Zero paráfrase inventada.

**Tabela `public.thematic_snapshots`:**
- Chave lógica: `UNIQUE (user_id, theme, period_start)`.
- Campos: `theme`, `period_start`/`period_end` (mês fechado), `snapshot_before`, `snapshot_change`, `evidence_quote`, `evidence_message_id` (FK → `messages`), `evidence_date`, `message_count_in_period`, `confidence` ∈ `high|low|insufficient_data`.
- RLS: usuário lê os próprios; admin lê todos; escrita só via `service_role`.

**Produtor único: `generate-thematic-snapshots` (edge)** + cron `generate-thematic-snapshots-monthly` (`0 13 1 * *` UTC = dia 1 10h BRT). Body opcional `{ user_id?, period_start?, period_end? }` para backfill.

**Guard-rails de volume (por usuário/mês):**
- `< 10 msgs` → grava 1 linha `theme='__month__'` com `confidence='insufficient_data'`, sem quote.
- `10–29 msgs` → `confidence='low'`, temas com ≥5 menções.
- `≥ 30 msgs` → `confidence='high'`, temas com ≥5 menções. Cap 4 temas/mês.

**Validação anti-alucinação (obrigatória):**
- `evidence_message_id` precisa existir em `messages` do próprio usuário no período.
- `evidence_quote` precisa ser **substring EXATA** de `messages.content`. Se falhar → snapshot descartado (não gravamos fantasia).
- Sem quote e sem `before`/`change` → não grava.

**Consumidores:**
1. Portal `/meu-espaco` aba "Sua jornada" (`JornadaTab.tsx`): timeline agrupada por tema, badge "leitura preliminar" quando `low`, card cinza quando só há `insufficient_data`.
2. `generate-monthly-letter`: injeta snapshots do mês como âncora obrigatória com instrução "cite pelo menos uma quote literal entre aspas"; se só houver `insufficient_data` → carta curta reconhecendo o silêncio.

**Fora de escopo v1 (decisão explícita):**
- `aura-agent` NÃO consome snapshots na v1. Aura já tem 4 camadas de memória (corrections → evolution_summary → insights → session_themes); adicionar 5ª camada sem auditar qualidade real é o tipo de acúmulo que causa contradição no turno rápido. Revisitar em 2-4 semanas com bloco dedicado `## Arco por tema`, filtro `high` only, cap de 3 temas, regra "não puxar sem o usuário abrir o tema".
- Dedup entre snapshots e `user_insights` fora de escopo.
- Aba admin de auditoria opcional (criar sob demanda).