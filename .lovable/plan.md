## Objetivo

Aura assume temas antigos quando o usuário só manda "Oi". Causa-raiz confirmada no código: 2 blocos diretivos rodam fora de `if (sessionActive)` (PADRÃO RECORRENTE + LEMBRETE ANTI-ECO) e o `userEvolutionSummary` é lido pelo Flash mesmo com aviso passivo.

Plano em **2 fases**. Fase 1 resolve ~80% do problema com risco baixíssimo. Fase 2 (opcional, depois) move a inteligência de abertura de sessão pra micro-agente one-shot.

---

## FASE 1 — Limpeza cirúrgica do prompt casual (aprovar agora)

Arquivo: `supabase/functions/aura-agent/index.ts`.

### 1.1 Mover `⚠️ PADRÃO RECORRENTE DE INAÇÃO` pra dentro de sessão

Linhas ~5328-5350. Hoje injeta confronto com frase pronta ("A gente já conversou sobre isso X vezes…") mesmo no "Oi" casual. Mover o bloco inteiro pra dentro do `if (sessionActive)` que já existe acima. Fora de sessão, o tracking de inação continua salvo no banco mas não vira instrução pro Flash.

### 1.2 Suavizar `LEMBRETE ANTI-ECO`

Linha ~6062, dispara em qualquer mensagem ≤5 palavras (inclui "Oi").

- Antes: `"Reaja com emoção própria, observação nova ou pergunta que avança."`
- Depois: `"Espelhe o tamanho da mensagem dele — responda curto. Só pergunte se houver gancho real no que ele disse; caso contrário, devolva presença sem puxar tema novo ou antigo."`

### 1.3 Modo SAUDAÇÃO / MENSAGEM LEVE (novo bloco, antes do anti-eco)

Injeção condicional no prompt quando `sessionActive === false` E sem sessão pendente, em 2 níveis:

**Nível A — Saudação pura** (regex hard):
```
^(oi+|olá+|ola+|e ai|e aí|hey|hi|hello|bom dia|boa tarde|boa noite|opa|alô)[.!?]*\s*$
```

**Nível B — Mensagem leve** (≤8 palavras E sem palavras de carga emocional na lista: `triste|ansios|medo|raiva|sozinho|cansad|perdid|chorando|surto|crise|ajuda|dor|peso|vazio|culp|angúst|pânico|desesper`):
Inclui "oi, tudo bem?", "e aí?", "tudo certo?", "oi aura", "bom dia, tudo bem?".

Bloco injetado (ambos os níveis):
```
## ABERTURA LEVE DETECTADA
A mensagem do usuário é cumprimento ou check-in casual, sem carga emocional clara.

- Responda APENAS ao que foi dito: cumprimente de volta + 1 devolutiva curta e neutra ("e aí, como cê tá?", "tô por aqui, o que te traz hoje?").
- PROIBIDO nesta resposta: referenciar memória, insights, evolution summary, compromissos pendentes, temas de sessões anteriores ou padrões observados.
- Espere o usuário trazer o tema antes de qualquer aprofundamento.
- Máximo 2 balões curtos.
```

### Validação Fase 1

1. Deploy `aura-agent`.
2. Conferir `failed_message_log` em 5 min (drift Lovable→GH Actions). Se erro, redisparar deploy manual.
3. Cenário "Oi" puro fora de sessão com compromissos pendentes → resposta ≤ 2 balões, sem mencionar compromisso.
4. Cenário "Oi, tudo bem?" → mesmo comportamento.
5. Cenário "tô em crise" (carga emocional) → NÃO dispara o bloco; Aura responde com presença e profundidade normais.
6. Cenário dentro de sessão ativa → PADRÃO RECORRENTE continua aparecendo (confronto afetuoso preservado onde é útil).

---

## FASE 2 — Micro-agente `session-opening-brief` (decidir depois)

Não implementar agora. Documentar como follow-up:

- Nova edge function `session-opening-brief` (Flash-lite) gera 1 parágrafo ≤240 chars no `start session`, persistido em `sessions.opening_brief`.
- `aura-agent` injeta o brief só no `messageCount_in_session === 0`.
- Permite, no futuro, remover blocos `REGRAS DE CONTINUIDADE` e `COMPROMISSOS PENDENTES` do `continuityContext` do prompt principal.
- Reavaliar depois de 1-2 semanas com Fase 1 em produção: se ainda houver queixa de "assumir tema antigo dentro de sessão", implementar.

---

## Arquivos da Fase 1

- `supabase/functions/aura-agent/index.ts` — 3 edits cirúrgicos (mover bloco, reescrever string, adicionar bloco condicional com regex + lista emocional).
- `mem/persona/abertura-leve-casual.md` (memória nova) + update `mem://index.md`.

## Rollback

Tudo em 1 arquivo, edits localizados. `git revert` do commit reverte 100%.

## Riscos

- Lista de palavras emocionais pode dar falso-negativo em PT-BR coloquial ("tô mal", "fudido"). Adicionei `mal\b` ao regex? Não — risco de pegar "bom dia, tudo bem?". Trade-off aceito: mensagem leve mal-classificada gera 1 turno raso, próximo turno corrige.
- Se Flash ignorar o "PROIBIDO", o anti-eco suavizado ainda evita pergunta forçada. Defesa em camadas.
