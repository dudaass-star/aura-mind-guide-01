## Objetivo

Criar a terceira camada da memória da AURA — um **resumo evolutivo narrativo** por usuário — que complementa `user_insights` (fatos atômicos) e `user_memory_corrections` (verdades prioritárias). Esta camada dá à AURA uma compreensão de "quem é a pessoa" sem forçar pauta e **sem inventar conexões entre temas distintos**.

## Arquitetura final da memória

```text
user_insights              → fatos atômicos com prioridade (4-10)
user_memory_corrections    → verdades de prioridade máxima (overrides)
user_evolution_summary     → narrativa curta de quem é a pessoa  ← NOVO
```

## Frente 1 — Tabela `user_evolution_summary`

Migration nova:

```sql
create table public.user_evolution_summary (
  user_id uuid primary key,
  summary_text text not null,
  last_generated_at timestamptz not null default now(),
  messages_count_at_generation integer not null default 0,
  generation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_evolution_summary enable row level security;
-- service role full access
-- portal token holders podem ler o próprio
-- admin pode ler tudo
```

Uma linha por usuário. Sempre upsert.

## Frente 2 — Função `regenerateEvolutionSummary(userId)`

Adicionar em `supabase/functions/aura-agent/index.ts`.

**Modelo:** `google/gemini-2.5-flash-lite`.

**Input:**
- últimas ~80 mensagens (`messages`)
- `user_insights` top 30 por prioridade
- `user_memory_corrections` (todas) — destacadas como **anti-padrões / conexões proibidas**
- `session_themes` ativos

**Prompt (PT-BR, hardcoded — núcleo anti-confabulação):**

```text
Você está gerando um resumo evolutivo de QUEM É este usuário, para a AURA usar
como contexto de fundo. Não é pauta. Não é agenda. É descrição factual.

LIMITE: Máximo 600 caracteres. Conte. Se passar, corte.

REGRA CRÍTICA — TRATAMENTO DOS INSIGHTS:
Cada insight da lista é um fato ISOLADO. Eles NÃO estão relacionados entre si
a menos que o próprio usuário tenha feito a conexão em fala literal nas
mensagens, ou que uma correção em user_memory_corrections afirme a conexão.

PROIBIDO:
- Inferir causa/efeito entre dois insights ("ansiedade POR CAUSA da esposa").
- Agrupar temas distintos sob um guarda-chuva ("questões familiares incluem
  esposa, mãe e trabalho").
- Usar conectivos que sugiram ligação ("relacionado a", "ligado a", "em torno
  de", "decorrente de", "especialmente quando", "por causa de").
- Incluir interpretações da AURA que o usuário não confirmou.
- Contradizer qualquer item de user_memory_corrections.

PERMITIDO:
- Listar temas em paralelo, em frases SEPARADAS por ponto final.
- Refletir literalmente o que o usuário disse.
- Refletir correções já registradas.

ESTRUTURA OBRIGATÓRIA (frases-fato em paralelo, não prosa corrida):

Identidade/momento: [1-2 frases factuais sobre vida atual]
Padrões observados: [2-4 frases SEPARADAS por ponto final, uma por padrão]
Evolução: [1-2 frases sobre o que ele já demonstrou conseguir]

TESTE INTERNO: cada frase deve poder ser lida sozinha sem perder sentido.
Se uma frase depende da anterior para fazer sentido, você está conectando —
refaça em paralelo.
```

**Bloco de correções como anti-padrões** (montado em código antes de mandar pro modelo):

```text
🛡️ CORREÇÕES — conexões PROIBIDAS para este usuário:
- {correction_text_1}
- {correction_text_2}
...
```

Saída salva em `user_evolution_summary.summary_text`.

**Trigger de regeneração** (no fim do `postConversationAnalysis`, **assíncrono**, nunca bloqueia resposta):

```ts
const shouldRegenerate =
  (messagesSinceLastGen >= 20) ||
  (hoursSinceLastGen >= 24);

if (shouldRegenerate) {
  EdgeRuntime.waitUntil(regenerateEvolutionSummary(userId));
}
```

**Truncamento defensivo** em código: `summary_text.slice(0, 600)` antes do upsert.

**Sem leitura do summary anterior**: a regeneração lê só `messages` + `user_insights` + `user_memory_corrections` + `session_themes`. Nunca o próprio summary, evitando deriva.

## Frente 3 — Injeção no prompt do `aura-agent`

Em `loadUserContext`, carregar o summary em paralelo.

Em `buildSystemPrompt`, injetar como bloco descritivo **logo após** o bloco de correções (prioridade máxima), **antes** dos insights gerais:

```text
📖 QUEM É {nome} (contexto de fundo, NÃO use como pauta):
{summary_text}

Use isso só pra entender quem está do outro lado. Não traga estes pontos à
tona se o usuário não abrir o gancho. Não conecte temas que estão em frases
separadas — eles estão separados de propósito.
```

## Frente 4 — Backfill para Eduardo

`user_id = 329ebadd-07eb-4e1e-88db-d8974b2ea3e5`

Rodar `regenerateEvolutionSummary(eduardoId)` uma vez via edge call manual.

**Critérios de aceite (rígidos):**
- ✅ Contém algo equivalente a "age apesar do medo".
- ✅ Contém algo equivalente a "prefere conversa livre, sem sessões agora".
- ✅ Menciona "atividade física" e "ansiedade" **em frases separadas, sem conectivo causal entre elas**.
- ❌ Se aparecer "ansiedade ligada a...", "em torno de...", "relacionada à esposa/exercício", "por causa de..." → **falhou**, ajustar prompt e regenerar.

## Garantias técnicas

- **Assíncrono**: `EdgeRuntime.waitUntil`, fora do caminho crítico.
- **Limite rígido**: 600 chars no prompt + truncamento em código.
- **Custo**: Flash-Lite + frequência baixa (a cada 20 msgs / 24h) → desprezível.
- **Anti-confabulação**: regra explícita, estrutura em frases-fato paralelas, correções como anti-padrões, lista de conectivos proibidos.
- **Sem deriva**: nunca lê o próprio summary anterior.
- **Coerência com correções**: correções entram como anti-padrões e o prompt proíbe contradizê-las.

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — tabela + RLS.
- `supabase/functions/aura-agent/index.ts`
  - nova função `regenerateEvolutionSummary`
  - `loadUserContext`: carregar summary
  - `buildSystemPrompt`: injetar bloco "QUEM É"
  - `postConversationAnalysis`: trigger assíncrono
- `src/integrations/supabase/types.ts` — auto-regenerado.
- Memória do projeto: registrar a nova camada em `mem://features/user-memory-structure`.

## Resultado esperado

- A AURA passa a ter noção contínua de quem o usuário é, sem reler 80 mensagens toda hora.
- O resumo respeita correções, não inventa conexões e não contradiz o que o usuário corrigiu.
- O Eduardo, após backfill, deve ter resumo coerente com "age apesar do medo" e "prefere conversa livre", e com temas (atividade física / ansiedade / esposa) em frases separadas — validando a arquitetura.
