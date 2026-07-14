## Linha do Tempo Emocional (P1) — Snapshots Temáticos com Evidência Literal

Transformar o saldo emocional em história ancorada por temas, com citações **literais e datadas** do usuário. Zero paráfrase inventada. V1 fica fora do chat da Aura — só portal + carta mensal — pra auditar qualidade antes de expor ao turno rápido.

---

### 1. Dados: tabela `thematic_snapshots`

Nova tabela em `public`, com RLS e GRANTs:

```
id uuid pk
user_id uuid
theme text                    -- "mãe", "trabalho", "ansiedade", "corpo"
period_start date
period_end date               -- mês fechado
snapshot_before text          -- "onde eu estava" (nullable)
snapshot_change text          -- "o que mudou" (nullable)
evidence_quote text           -- CITAÇÃO LITERAL do usuário (nullable)
evidence_message_id uuid      -- FK -> messages(id), nullable
evidence_date timestamptz
message_count_in_period int
confidence text CHECK IN ('high','low','insufficient_data')
created_at, updated_at
UNIQUE (user_id, theme, period_start)
```

- RLS: usuário lê os próprios via portal token; `service_role` full.
- GRANTs explícitos (sem `anon`).

### 2. Produtor único: `generate-thematic-snapshots` + cron mensal

Edge function nova, roda dia 1 de cada mês (10h BRT), para o mês anterior. Por usuário ativo:

1. Conta mensagens `role='user'` no período.
2. **Guard-rails anti-alucinação:**
   - `< 10 msgs` → grava 1 linha `confidence='insufficient_data'`, sem before/change/quote.
   - `10–29 msgs` → `confidence='low'`. Só temas com ≥5 menções.
   - `≥ 30 msgs` → `confidence='high'`. Temas com ≥5 menções.
3. Agrupa temas por `session_themes` + top `mention_count` de `user_insights` no período.
4. Chama Flash-lite com prompt estrito. Input: mensagens literais do usuário + snapshot do mês anterior (se houver). Output esperado (tool calling): `{ before, change, evidence_message_id, evidence_quote }`.
5. **Validação obrigatória pós-LLM:**
   - `evidence_message_id` precisa existir em `messages` do usuário no período.
   - `evidence_quote` precisa ser **substring exata** de `messages.content`. Se não bater → descarta o snapshot (sem fallback fantasia).

### 3. Consumidor 1: aba "Sua Jornada" no portal

Novo componente `src/components/portal/JornadaTab.tsx` em `/meu-espaco`. Timeline vertical agrupada por tema, ordem cronológica reversa:

```
Mãe
  ├─ Junho: [before] → [change]
  │   "citação literal" — 12/06
  └─ Maio: [before] → [change]
      "citação literal" — 03/05
```

Estados vazios explícitos:
- `insufficient_data` → card cinza: *"Neste mês vocês conversaram pouco — sem material suficiente pra uma leitura honesta."*
- Sem histórico algum → *"Sua jornada começa a se desenhar depois do primeiro mês ativo."*
- `confidence='low'` → badge "leitura preliminar" no card.

### 4. Consumidor 2: `generate-monthly-letter` ancorada

Em `gatherContext`, adicionar leitura de snapshots do mês (`confidence in ('high','low')`) e injetar no `userPrompt` como âncoras obrigatórias, com instrução: *"cite pelo menos uma `evidence_quote` literal entre aspas"*.

Se todos os snapshots do mês forem `insufficient_data` (ou vazios) → gerar carta curta reconhecendo o silêncio, sem inventar arco.

### 5. Fora de escopo desta v1 (decisão explícita)

- **Chat da Aura NÃO recebe snapshots nesta versão.** Aura hoje já tem 4 camadas de memória (corrections → evolution_summary → insights → themes). Adicionar uma 5ª camada sem auditar qualidade real dos snapshots gerados é o tipo de acúmulo que causa alucinação e contradição no turno rápido. Depois de 2-4 semanas com dados reais no portal, revisitamos com bloco dedicado `## Arco por tema`, filtro `high` apenas, cap de 3 temas, e regra "não puxar sem o usuário abrir o tema".
- Aba admin de auditoria por usuário (opcional; se sentir falta pra QA, criamos depois).
- Dedup de entidades entre snapshots e `user_insights`.

---

### Guard-rails de alucinação (consolidado)

| Situação | Comportamento |
|---|---|
| 0 msgs no mês | Nenhuma linha; carta reconhece ausência ou é pulada |
| 1–9 msgs | `insufficient_data`; portal mostra card cinza; carta curta e honesta |
| 10–29 msgs | `confidence='low'`; portal com badge preliminar; entra na carta como âncora |
| ≥30 msgs, tema <5 menções | Tema descartado |
| LLM inventa citação | Validação de substring exata rejeita o snapshot inteiro |
| Sem `evidence_message_id` válido | Snapshot descartado |
| Snapshot colide com `user_memory_corrections` | Correction vence; snapshot é descartado (aplicado quando o chat entrar na v2) |

### Ordem de execução

1. Migration: `thematic_snapshots` + GRANTs + RLS + índices (`user_id, period_start desc`, `user_id, theme`).
2. Edge function `generate-thematic-snapshots` + cron mensal (`pg_cron` + `pg_net`, dia 1 às 10h BRT).
3. Atualização de `generate-monthly-letter` (gatherContext + prompt).
4. `JornadaTab.tsx` no portal + adicionar aba no `UserPortal.tsx`.
5. Rodar produção uma vez em modo backfill do mês corrente pra popular a aba antes do próximo dia 1.

### Arquivos tocados

- **Novo:** migration da tabela + cron.
- **Novo:** `supabase/functions/generate-thematic-snapshots/index.ts`.
- **Novo:** `src/components/portal/JornadaTab.tsx`.
- **Editado:** `supabase/functions/generate-monthly-letter/index.ts` (gatherContext + prompt).
- **Editado:** `src/pages/UserPortal.tsx` (registrar nova aba).

### Memória de projeto

Salvar `mem://features/thematic-snapshots` documentando: tabela, guard-rails de volume, validação de substring, e decisão explícita de manter fora do chat na v1.
