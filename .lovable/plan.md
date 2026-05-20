## Objetivo

Descobrir, com evidência, **se e quando** o Phase Evaluator transicionou o Alan de **Presença → Sentido → Movimento** na sessão `db5738b1-0bfc-4d65-8f3a-150ba0610bfd` (19/05 20:19→21:35 UTC, ~17h19→18h35 BRT, 76min). Hipótese a validar: a sessão ficou presa em Presença a sessão inteira, sem Reframe cirúrgico nem fechamento com Movimento, o que explicaria a nota 1⭐.

## O que já sabemos (do contexto)

- Sessão concluída, `rating_requested=true`, `post_session_sent=true`, `commitments=[]` (sem Movimento gravado).
- Phase Evaluator é determinístico: dado o histórico de mensagens + `sessionPhase` + `sessionElapsedMin` + `last_user_context.aura_phase`, produz sempre a mesma `detectedPhase` e `guidance`.
- A tabela `messages` **não persiste** `aura_phase` por turno — só `role`/`content`/`created_at`. Precisamos reconstruir.
- A tabela `sessions` também não armazena fase atual. A única evidência viva são os logs do `aura-agent` (`🔄 Phase evaluator: ...`), que normalmente já rotacionaram para uma sessão de 24h+ atrás.

## Passos da auditoria

### 1. Extrair a conversa completa da sessão
Query nas `messages` do `user_id=ca756632-21b6-4c35-b88e-0d2e8f8a6cb2` entre `started_at` e `ended_at`. Salvar em `/tmp/alan_session.json` com `role`, `content`, `created_at` e o `sessionElapsedMin` calculado a partir de `started_at`.

### 2. Replay local do Phase Evaluator
Extrair `evaluateTherapeuticPhase` + `SESSION_PHASE_INSTRUCTIONS` do `supabase/functions/aura-agent/index.ts` para um script Deno isolado (`/tmp/replay_phase.ts`). Para cada turno do usuário na sessão:
- Montar `messageHistory` acumulada (apenas mensagens até aquele turno).
- Calcular `sessionElapsedMin` real.
- Derivar `sessionPhase` (`opening` 0–8min → `exploration` 8–35min → `transition` 35–40min → `closing` 40+min — confirmar limites no código antes de rodar).
- Como `last_user_context.aura_phase` (micro-agent semântico) não está persistido, rodar duas passadas:
  - **(a) sem aura_phase** → expõe o que o fallback por palavras-chave (`presencaScore` vs `sentidoScore`) decide.
  - **(b) forçando `aura_phase='sentido'` a partir do turno em que aparecem palavras-chave de sentido** → expõe o cenário "se o micro-agent tivesse detectado".
- Para cada turno, registrar: `detectedPhase`, `stagnationLevel`, `guidance` (truncada), e qual gatilho disparou (`>= 4 presenca`, `>= 5 sentido`, `stuck_in_opening` etc.).

Saída: tabela CSV `/mnt/documents/alan_phase_replay.csv` com colunas `turn, minute, role, snippet, sessionPhase, detectedPhase, trigger, stagnation, guidance_kind`.

### 3. Verificar Reframe e Movimento no diálogo real
Sobre o transcript já extraído, marcar manualmente (regex + leitura):
- Presença de **Reframe cirúrgico** durante a sessão (não depois) — buscar viradas como "você passou X construindo Y", "o que isso te custa", "qual o preço de…".
- Presença de **pergunta de compromisso** da Aura entre min 35–45 ("topa…?", "combinado?", "sua única tarefa…", "como compromisso pra essa semana…").
- Aceite/recusa do usuário a esse compromisso.

### 4. Cruzar com `session-extractor`
Comparar o `session_summary` + `key_insights` + `commitments` que o `session-extractor` gravou para `db5738b1` com o que de fato apareceu no diálogo. Se `commitments=[]` mas existiu pergunta-compromisso ignorada pelo usuário, o extrator está correto e o problema é clínico (faltou Aura propor). Se o extrator perdeu um aceite, é bug do extrator.

### 5. Tentar puxar logs originais (best effort)
Rodar `supabase--edge_function_logs` em `aura-agent` filtrando por `ca756632` e por `🔄 Phase evaluator`. Se ainda existirem logs de 19/05, comparar `detectedPhase` real (com `aura_phase` do micro-agent vivo) contra o replay teórico do passo 2. Se logs já rotacionaram, dependemos só do replay.

### 6. Diagnóstico final
Produzir um pequeno relatório (`/mnt/documents/alan_phase_audit.md`) com:
- Linha do tempo: minuto-a-minuto da fase detectada vs fase esperada.
- Em que turno o evaluator **deveria** ter forçado `presenca → sentido` (gatilho `recentPairs >= 4`) e se a `guidance` foi injetada.
- Em que turno **deveria** ter forçado `sentido → movimento` (`recentPairs >= 5`) e se a Aura respondeu com pergunta-compromisso.
- Veredito: (a) evaluator funcionou e a Aura ignorou a `guidance`, (b) evaluator nunca disparou porque `last_user_context.aura_phase` ficou colado em `presenca`, ou (c) `sessionPhase` não evoluiu por bug de cálculo de `sessionElapsedMin`.
- Recomendação objetiva de fix (no evaluator, no micro-agent semântico, ou no prompt da fase).

## Detalhes técnicos relevantes

- `evaluateTherapeuticPhase` vive em `supabase/functions/aura-agent/index.ts` linhas ~1088–1365.
- Gatilhos atuais (memorizados): `recentPairs >= 4 && presenca` → força Sentido; `recentPairs >= 5 && sentido` → força Movimento; freio `recentUserCount < 4` mantém Presença.
- `sessionPhase` (`opening|exploration|transition|closing`) é calculado fora do evaluator e passado como parâmetro — precisamos achar a função que decide isso (provavelmente perto da linha 5899 onde `phaseEval` é chamado) e replicar.
- A sessão real do Alan no banco é `db5738b1-0bfc-4d65-8f3a-150ba0610bfd` (não o id citado no resumo anterior); horário BRT é **17h19→18h35**, não 20h30. O resumo anterior usou UTC como se fosse BRT — vale corrigir no relatório.

## Entregáveis

- `/mnt/documents/alan_phase_replay.csv` — replay turno-a-turno.
- `/mnt/documents/alan_phase_audit.md` — diagnóstico + recomendação de fix.
- Comentário final no chat: 3–5 linhas com o veredito (a/b/c) e o próximo passo recomendado.

## Fora de escopo

- Mudar prompt do `aura-agent` agora (fica para um plano de fix separado, depois do diagnóstico).
- Auditar outras sessões (Bárbara 5⭐, Thatyane sem rating) — pode virar plano (b) depois.
