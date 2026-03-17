# Consolidação dos Frameworks Comportamentais ✅ Implementado

## Resumo
6 frameworks sobrepostos (Timer Emocional, Anti-Loop, Cenários A-D, etc.) consolidados em uma ESTRUTURA DE ATENDIMENTO hierárquica com 4 modos: Ping-Pong, Profundo, Direção, Emergência.

### O que foi feito
1. **Timer Emocional** ✅ — Removido (redundante com fases do Modo Profundo), substituído por frase diretiva curta
2. **Anti-Loop** ✅ — Reescrito com classificação contextual (confirmação vs evasão), proteção para trial/<20 trocas
3. **Detecção de Travamento** ✅ — Dividida em 2 camadas:
   - Intra-conversa: integrado ao prompt com reformulação por opções concretas
   - Inter-conversas: contexto dinâmico via commitments (follow_up_count >= 2 ou >14 dias)
4. **Cenários A/B/C/D** ✅ — Eliminados e consolidados na ESTRUTURA DE ATENDIMENTO (4 modos)
5. **Protocolo de Condução** ✅ — Mantido (complementar, não conflitante)
6. **Modo Direção** ✅ — Protocolo 4 etapas preservado dentro da estrutura consolidada

### Resultado
- ~120 linhas removidas do prompt
- 1 árvore de decisão clara em vez de 6 frameworks concorrentes
- Trial users protegidos contra encerramento prematuro

---

# Limpeza Estrutural do Prompt ✅ Implementado

## Resumo
Eliminação de seções duplicadas e deduplicação de regras repetidas após a consolidação dos frameworks.

### O que foi feito
1. **ESTILO AURA + MÓDULO DE PROFUNDIDADE** ✅ — Fundidos em "DNA DA AURA" (~40 linhas a menos)
2. **PADRÕES DE RESPOSTA** ✅ — Eliminados (redundantes com Modo Profundo e Modo Direção, ~30 linhas)
3. **LEITURA DO MOMENTO** ✅ — Eliminada (duplicata da ESTRUTURA DE ATENDIMENTO, ~30 linhas)
4. **"1 pergunta por vez"** ✅ — Deduplicada: regra canônica na seção REGRA CRÍTICA, repetições convertidas em referências curtas (~20 linhas)

### Resultado
- ~120 linhas adicionais removidas do prompt
- Sem perda de regras — apenas eliminação de redundância

---

# Trial "Primeira Jornada" — Detecção de Marcos de Valor ✅ Implementado

## Resumo
Trial expandido de 10 para **50 mensagens ou 72h**, com detecção inteligente de "Aha Moment" em duas camadas para acionar nudges de conversão no momento certo.

### Limites
- Hard cap: 50 mensagens OU 72 horas (o que vier primeiro)
- Fallback de nudges: msg 45 e 48 se Aha não detectado

### Fases do Trial (`trial_phase`)
- `listening` — Escuta ativa (msgs 1-7, sem intervenção)
- `value_delivered` — Aura entregou valor real (tag `[VALOR_ENTREGUE]`)
- `aha_reached` — Usuário reagiu positivamente ao valor (detectado por heurísticas)
- `converting` — Nudges de conversão ativos

### Detecção em Duas Camadas

**Camada 1 — Tag da Aura: `[VALOR_ENTREGUE]`**
- Aura marca quando entrega: reframe, técnica prática, insight estruturado
- NÃO marca: validação simples, perguntas abertas, acolhimento genérico
- Webhook detecta a tag → `trial_phase = 'value_delivered'`

**Camada 2 — Resposta do Usuário**
- Só avaliada quando `trial_phase = 'value_delivered'` E `count >= 8`
- Detecta palavras-chave positivas sem "?" (lista de ~25 termos)
- Ao detectar → `trial_phase = 'aha_reached'`, salva `trial_aha_at_count`

### Sequência de Nudges
- Aha + 2 msgs: nudge suave ("Tô adorando te conhecer...")
- Aha + 4 msgs: nudge com link de checkout
- Fallback msg 45: nudge se Aha não detectado
- Fallback msg 48: nudge final
- Msg 50 / 72h: bloqueio + follow-up sequence (5 touchpoints)

### O que foi implementado
1. **Migração SQL** ✅ — `trial_phase text` e `trial_aha_at_count integer` em `profiles`
2. **`aura-agent/index.ts`** ✅ — Tag `[VALOR_ENTREGUE]` + contexto dinâmico por fase/aha
3. **`webhook-zapi/index.ts`** ✅ — Limite 50/72h, detecção de tag, análise de Aha, strip de tag
4. **`start-trial/index.ts`** ✅ — Mensagem de boas-vindas sem número fixo
5. **Frontend** ✅ — `StartTrial.tsx`, `TrialStarted.tsx`, `AdminMessages.tsx`, `AdminEngagement.tsx`
6. **`execute-scheduled-tasks/index.ts`** ✅ — Textos atualizados
7. **`admin-engagement-metrics/index.ts`** ✅ — Funnel atualizado (20+ msgs = engajado)

---

# Memória Terapêutica da Aura ✅ Implementado

## Resumo
Aura agora rastreia técnicas terapêuticas usadas, captura compromissos de conversas livres, e usa tags de tema fora de sessões formais.

### O que foi implementado
1. **`tecnica` como categoria de insight** ✅ — Prioridade alta no prompt, exemplos: reframe_sofrimento, responsabilidade_radical, derreflexao, etc.
2. **Tag `[COMPROMISSO_LIVRE:texto]`** ✅ — Parser no webhook insere na tabela `commitments` com `session_id: null`
3. **Tags de tema em conversas livres** ✅ — Instrução explícita no prompt para usar `[TEMA_NOVO]`, `[TEMA_PROGREDINDO]` etc. fora de sessões
4. **Contexto dinâmico `## Processo Terapêutico`** ✅ — Injeta técnicas já usadas e compromissos pendentes no contexto do modelo

### O que NÃO foi feito (por design)
- Detecção de fase terapêutica (Presença/Sentido/Movimento) — o modelo infere do histórico
- Categoria `insight_chave` — `session_themes` já cobre
- Migração de banco — `user_insights.category` é text livre, suporta `tecnica` nativamente

---

# Fase 3: Limpeza Cirúrgica do Prompt ✅ Implementado

## Resumo
4 problemas estruturais resolvidos para melhorar o fluxo conversacional e reduzir ruído no prompt.

### O que foi feito

1. **ENCERRAMENTO COM GANCHO relocado** ✅
   - Removido do fluxo geral (onde causava ganchos forçados em conversas comuns)
   - Movido para dentro da fase de Fechamento Suave (soft_closing) das sessões, onde faz sentido

2. **CONTEXTO TEMPORAL duplicado removido** ✅
   - Seção "# CONTEXTO TEMPORAL (MUITO IMPORTANTE!)" eliminada
   - Os dados já são injetados automaticamente no bloco DADOS DINÂMICOS DO SISTEMA

3. **Proibições consolidadas** ✅
   - Convertidas de framing negativo para positivo onde possível:
     - "PROIBIÇÃO DE PAPAGAIO" → "ANTI-PAPAGAIO" com exemplos positivos primeiro
     - "Proibido Robolês" → "Fale como gente"
     - "REGRA DE PROIBIÇÃO DE DISCLAIMER" → "REGRA DE IDENTIDADE"
     - "PROIBIDO mini-palestras" → "Evite mini-palestras"
     - "NUNCA agende no passado" → "Agende apenas no futuro"
   - Regras de áudio simplificadas de 9 para 6 itens (removidas redundâncias)
   - Proibições de segurança (Nível 1/2/3) mantidas intactas — são críticas

4. **[VALOR_ENTREGUE] corrigido** ✅
   - Adicionada instrução explícita: tag marca progresso PARCIAL
   - "Entrega de valor é sinal para APROFUNDAR, não para encerrar"
   - Instrução para continuar com pergunta de aprofundamento após a tag

### Resultado
- ~30 linhas removidas (ENCERRAMENTO COM GANCHO + CONTEXTO TEMPORAL)
- Redução significativa de framing negativo no prompt
- Ganchos de sessão agora aparecem apenas no contexto correto
- [VALOR_ENTREGUE] não mais funciona como sinal de "missão cumprida"
