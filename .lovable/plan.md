# Painel de análise de cobertura de sessões

## Objetivo

Auditar, sob demanda, se cada sessão real cobriu o que o prompt promete: **4 camadas investigativas** (FATO/EMOÇÃO/CRENÇA/ORIGEM), **3 fases** (presença/sentido/movimento), qualidade do reframe e do fechamento. Análise post-hoc via LLM lendo a transcrição completa.

Escopo: sessões agendadas a partir de amanhã + sessões `completed` que rodarem daqui pra frente. Sem retroativo bulk.

## 1. Nova rota admin: `/admin/sessoes`

Adicionar ao `App.tsx` ao lado de `/admin/engajamento`. Página `AdminSessions.tsx` com duas seções:

- **Próximas sessões** (agendadas, scheduled_at >= amanhã 00h BRT): lista quem/quando/plano/topic. Sem análise (não rodaram). Só visibilidade.
- **Sessões para auditar** (status=`completed`, ended_at nos últimos 30 dias): tabela com usuário, duração real, status da análise (`pendente` / `analisada`), botão **Analisar** ou **Ver análise**.

Acesso restrito via `has_role(uid, 'admin')`. Reaproveita padrão já existente em `/admin/engajamento`.

## 2. Nova tabela: `session_coverage_analyses`

Cache da análise para não re-chamar LLM por sessão.

Colunas:
- `id uuid pk`
- `session_id uuid unique fk sessions(id) on delete cascade`
- `analyzed_at timestamptz default now()`
- `model text` (ex. `google/gemini-3-flash-preview`)
- `coverage jsonb` (estrutura abaixo)
- `overall_score int` (1–5)
- `diagnosis text` (3–5 linhas, PT-BR)
- `red_flags text[]` (lista curta)

RLS: SELECT/INSERT só para `has_role(uid, 'admin')`; service_role full. GRANTs explícitos.

Shape do `coverage`:

```json
{
  "camadas": {
    "fato":    { "coberta": true, "evidencia": "..." },
    "emocao":  { "coberta": true, "evidencia": "..." },
    "crenca":  { "coberta": false, "evidencia": null },
    "origem":  { "coberta": false, "evidencia": null }
  },
  "fases": {
    "presenca":  { "coberta": true, "comentario": "..." },
    "sentido":   { "coberta": true, "comentario": "..." },
    "movimento": { "coberta": false, "comentario": "..." }
  },
  "reframe":     { "emergiu": true, "como_hipotese_aberta": true, "qualidade_1_5": 4, "trecho": "..." },
  "fechamento":  { "formato_cardapio": "tese|encruzilhada|leitura|experimento|pergunta|escolha-binaria|micro-passo|nenhum", "usuario_se_comprometeu": false, "trecho": "..." }
}
```

## 3. Nova edge function: `analyze-session-coverage`

`supabase/functions/analyze-session-coverage/index.ts`.

Entrada: `{ session_id }`. Validação: caller precisa ser admin (JWT claims + `has_role`).

Fluxo:
1. Carrega `sessions` row + todas as `messages` da sessão (ordem cronológica), e `last_user_context` final do `aura_response_state` (pra cross-check).
2. Se já existe linha em `session_coverage_analyses` para o `session_id` e `force=false`, retorna a cache.
3. Strip de tags internas no histórico (reusa `stripAllInternalTags` — copiar helper enxuto, sem importar de `aura-agent`).
4. Monta prompt em PT-BR com transcrição completa + definições estritas das 4 camadas e das 3 fases (mesmo dicionário usado no extractor da Fase 1, evita drift).
5. Chama Lovable AI Gateway com `google/gemini-3-flash-preview` via `generateText` + `Output.object` (schema Zod compacto correspondendo ao `coverage` acima + `overall_score` + `diagnosis` + `red_flags`).
6. UPSERT em `session_coverage_analyses` pelo `session_id`.
7. Retorna a análise.

Tamanho da sessão: cap de ~30k chars de transcrição (truncar mensagens muito longas no meio, manter início e fim). Em prática uma sessão de 45 min cabe.

Red flags candidatos a detectar (lista fechada no prompt pra evitar enum dinâmico): `dramatizacao`, `perguntas_socraticas_vazias`, `reframe_imposto_sem_hipotese`, `clock_muleta_acionado`, `fechamento_forcado_sem_material`, `concordancia_passiva_tratada_como_reflexao`, `interrupcao_fase_presenca`.

## 4. UI de análise

Componente `SessionCoverageCard.tsx` consumido pela página admin.

- Botão **Analisar** dispara `supabase.functions.invoke('analyze-session-coverage', { body: { session_id } })`. Estado loading com spinner (10–25s típico).
- Resultado renderiza:
  - **Checklist camadas**: 4 itens com ✅/❌ + evidência colapsável.
  - **Checklist fases**: 3 itens com ✅/❌ + comentário curto.
  - **Reframe**: badge ("emergiu como hipótese aberta" / "imposto" / "não emergiu") + nota 1–5.
  - **Fechamento**: formato do cardápio + se usuário se comprometeu.
  - **Red flags**: chips vermelhos quando presentes.
  - **Diagnóstico**: bloco de texto livre (3–5 linhas).
  - **Nota geral**: 1–5 em destaque.
- Botão **Re-analisar** (passa `force=true`, sobrescreve a linha).
- Link "abrir conversa" leva pra `/admin/usuarios?user_id=...` (se já existir esse padrão; senão, só mostra o telefone).

## Fora de escopo

- Análise automática ao fim da sessão (fica para depois, evita custo recorrente até validar utilidade).
- Backfill retroativo das sessões antigas (só roda sob demanda; quem quiser analisa).
- Métricas agregadas / gráficos (primeira versão é por-sessão; agregação vem depois com 20+ análises).
- Comparação entre sessões do mesmo usuário (futuro).
- Nada mexe em `aura-agent`, `phase evaluator`, ou prompt da Aura — é puramente leitura.

## Risco e mitigação

**Drift de definição**: as 4 camadas no analisador precisam usar o mesmo vocabulário do prompt da Aura (FATO/EMOÇÃO/CRENÇA/ORIGEM) e da Fase 1 (information_density). Mitigação: copiar literalmente as definições estritas no prompt do analisador, comentário no código apontando pra fonte.

**Falso-positivo de "coberta"**: Flash pode marcar `crenca.coberta=true` por menção superficial. Mitigação: schema exige `evidencia` literal (trecho curto da conversa); se evidência vazia, considerar `false` na UI.