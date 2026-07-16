
# Avaliação das sugestões (M1–M4 + instrumentação)

Fiz o cruzamento com o que já roda hoje. Resumo honesto: **o princípio está certo, mas 60% das "novidades" já existem** — em partes escondidas do código. O risco real não é *implementar mais*, é *duplicar comportamento* em cima do que já está instrumentado e criar duas fontes de verdade (o próprio defeito que M3 quer curar).

---

## Instrumentação prévia → **já existe, não precisa refazer**
`session-extractor` já grava por sessão: `session_summary`, `key_insights`, `commitments`, `theme_label`, `reframe_text`, **`closure_type`** (7 formatos do Cardápio) e **`closure_text`**. O que **falta** de fato é:
- `closure_mode`: `dialogada | unilateral | pausa | no_show` (o "como terminou", não o "que formato foi").
- `last_user_emotional_state` no momento do fechamento (o extractor não persiste isso hoje).
- `had_dated_bridge` (bool) e `commitment_confirmed` (bool).

**Custo:** 4 colunas + ajuste no prompt do extractor. Baixo. Vale.

---

## M1 — Contrato de encerramento (4 saídas)

**Já existe parcialmente** (`session-reminder` linhas 677-745):
- `≤1 msg do user` → `no_show` ✅
- `2–4 msgs` → `no_show` com aviso ✅
- `≥5 msgs` → `completed` + extractor + rating ✅
- pausa via tag `[PAUSAR_SESSOES]` ✅

**O que a sugestão adiciona de real:**
1. **"Aterrissagem unilateral"** — se o usuário silencia N min *na fase final* (`aterrissagem`), a AURA envia fechamento antes de expirar. Hoje: nada acontece até o grace de 60min estourar e virar `completed` genérico. **Isso sim é novo e tem valor.**
2. **No-show nunca vira completed** — já é a regra hoje. Ok.
3. **"81 sessões fantasma"** — precisa auditar o que são antes de mexer. Podem ser sessões antigas de antes das regras atuais (falso positivo).

**Risco crítico:** aterrissagem unilateral automática é a AURA falando sozinha depois de silêncio. Se disparar cedo demais, atropela usuário que só foi ao banheiro. Se disparar tarde, não resolve nada. Precisa gate: só na fase `aterrissagem` (o phase-evaluator já sabe) + silêncio ≥ X min + dentro do contrato de 45min. E precisa contar como sessão real (rating condicional funciona).

**Decisão sugerida:** aprovar **só o item 1** (aterrissagem unilateral) + as 4 colunas de instrumentação. Rejeitar reescrita do fluxo — o resto já roda.

---

## M2 — Gate de estado conversacional para todo outbound

**Já existe fragmentado:**
- `aura_response_state.pending_content/is_responding` — gate de interrupção.
- Silent hours 22h-08h — gate temporal.
- `session-reminder` checa `post_session_sent`, `rating_requested`, atividade recente antes de mandar rating.
- `sendProactive` já bloqueia se há sessão ativa ou interação recente.
- `Presence Brake` + phase-evaluator lêem `user_emotional_state`, `density`, `recentPairs`.

**O que falta:** um **campo único derivado** (`last_interaction_closure_state`) que sirva de gate consolidado para os cron jobs periféricos (`scheduled-checkin`, `scheduled-followup`, `periodic-content`, `deliver-trial-insight`, `reactivation-blast`, `reengagement-blast`, `winback-canceled-users`). Hoje cada um faz seu próprio check parcial → daí o "jornada alegre pós-luto".

**Risco:** derivar esse estado em tempo real a cada outbound = custo. Melhor: o `session-extractor` e o `postConversationAnalysis` já rodam — que eles gravem `last_interaction_closure_state` no `profiles` e os crons leiam. Zero IA nova.

**Decisão sugerida:** **APROVAR na versão barata** — 1 coluna em `profiles` + leitura pelos ~7 crons. Alto ROI, baixo risco. Este é o mais valioso dos quatro.

---

## M3 — Compromisso unificado

**Este é o mais delicado.** Há **duas fontes hoje**:
- `sessions.commitments` (jsonb, escrito pelo `session-extractor`) — usado no *pós-sessão* (mensagem de resumo) e no prompt (`session.commitments` linha 4177).
- `commitments` (tabela) — escrita pelo `aura-agent` durante a conversa e pelo `postConversationAnalysis`; lida como "pendentes" no prompt (linha 5260).

Elas **não são a mesma coisa por design**: uma é snapshot da sessão, outra é backlog vivo entre sessões. Colapsar tudo em uma só quebra o `formatPendingCommitmentsForFollowup` e a cobrança de abertura. **A sugestão está errada nesse ponto.**

**O que faz sentido salvar da M3:**
- **Régua mais estrita**: "compromisso só existe se for fala do usuário em 1ª pessoa com ação futura". Isso é ajuste de prompt no `session-extractor` e no `postConversationAnalysis`. Barato, direto.
- **Sync one-way**: quando `session-extractor` cria `sessions.commitments`, espelhar como rows em `commitments` (source of truth = tabela). Elimina divergência sem colapsar semântica.
- **Métrica de precisão** por amostragem — vale como painel admin, não como código de produção.

**Decisão sugerida:** aprovar **régua estrita + sync one-way**; rejeitar "fonte única".

---

## M4 — Cancelamento de balões em fila

**Verificação:** interrupção existe hoje na **geração** (`pending_content` acumula e re-processa — linhas 1161/1468 do `process-webhook-message`), mas **não na entrega** (loop de balões do `aura-agent` não checa `messages` novas do user antes de enviar cada balão).

**A sugestão está correta e é barata:** antes de cada balão do loop de envio, `SELECT 1 FROM messages WHERE user_id=X AND role='user' AND created_at > loop_start_ts LIMIT 1`. Se existir, aborta o restante e escreve o que sobrou em `pending_content` (mesmo caminho já testado).

**Risco:** query extra por balão. Mitigação: só a partir do 2º balão + com `LIMIT 1`. Custo desprezível.

**Decisão sugerida:** APROVAR.

---

## Ordem de execução recomendada

| # | Ação | Complexidade | Risco | Valor |
|---|------|--------------|-------|-------|
| 1 | Instrumentação: 4 colunas + prompt do extractor | Baixa | Nenhum | Alto (baseline) |
| 2 | M2: `last_interaction_closure_state` + leitura nos 7 crons | Média | Baixo | **Muito alto** |
| 3 | M4: interrupção na entrega de balões | Baixa | Baixo | Médio |
| 4 | M3: régua estrita + sync one-way `sessions→commitments` | Média | Médio | Médio |
| 5 | M1: aterrissagem unilateral (só na fase `aterrissagem`) | Média | **Alto** | Alto se acertar |

**Não implementar:** "fonte única de commitments" (quebra semântica), "auditoria das 81 fantasmas" antes de saber se são legado, reescrita do contrato de encerramento (já existe).

---

## Pergunta antes de qualquer código

Aprovando essa priorização, o caminho concreto seria começar por **#1 + #2** juntos numa migração + edit em `session-extractor` + edits em `scheduled-checkin/followup/periodic-content/reactivation-blast`. Confirma essa ordem, ou prefere olhar antes as 81 sessões fantasma (auditoria SQL de 5 min) pra decidir se M1 sobe de prioridade?
