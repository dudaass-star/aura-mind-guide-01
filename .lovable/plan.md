# Plano: consertar phase evaluator antes de remover muletas

## Princípio

As muletas C9 (`AÇÃO OBRIGATÓRIA AGORA`) e C10 (`REDE DE SEGURANÇA — FECHAMENTO OBRIGATÓRIO`) existem porque o evaluator é **cego** a dois sinais:
- Se o **conteúdo já está saturado** (só conta pares de troca)
- Se o **usuário** já entrou em modo reflexivo (só lê palavras-chave do que a Aura disse)

Resultado: trava em `presenca`, fica circulando, e quando o cronômetro estoura as muletas chutam a porta forçando entrega sem material → produz a dramatização que queremos eliminar.

**Estratégia:** dar olhos ao evaluator primeiro. Quando ele transicionar bem sozinho, as muletas viram redundância e podem ser removidas (ou viram suaves) sem regredir.

## Fase 1 — Dar olhos ao evaluator (consertar a causa-raiz)

Mudanças no `evaluateTherapeuticPhase` em `supabase/functions/aura-agent/index.ts:1131` e no micro-agent extractor (Flash-lite com tool calling).

### 1.1. Novo sinal `information_density`

Valores: `low` / `medium` / `saturated`.

**Definição estrita no prompt do micro-agente** (anti-falso-positivo por volume):

> `saturated` exige os **três** elementos presentes na conversa:
> 1. **Contexto concreto**: situação específica, não abstrata ("meu chefe me chamou ontem", não "tenho problemas no trabalho").
> 2. **Emoção nomeada**: o usuário nomeou ou descreveu o que sentiu, não só citou o fato.
> 3. **Crença/origem**: apareceu algo sobre o "porquê" — uma crença sobre si, padrão antigo, ou primeira vez que sentiu isso.
>
> Se faltar qualquer um dos três → `medium`. Volume de texto NÃO conta. Repetir o mesmo elemento três vezes NÃO conta.

### 1.2. Novo sinal `user_reflection_mode`

Boolean — detecta quando o **usuário** entra em postura reflexiva, permitindo avanço para `sentido` sem depender de keyword da Aura.

**Guarda contra falso-positivo** (não confundir reflexão com concordância superficial):

> Marca `true` SÓ se o usuário **ele mesmo** trouxe uma conexão nova:
> - "agora que você falou, percebi que…"
> - "acho que sempre fui assim porque…"
> - "talvez seja porque quando criança…"
> - "nunca tinha pensado, mas…"
>
> NÃO marca `true` para concordância passiva: "ah faz sentido", "é verdade", "exatamente", "concordo". Concordar com a Aura ≠ refletir.

### 1.3. Novo sinal `user_engaged_with_commitment`

Boolean — detecta se o usuário **respondeu concretamente** à última pergunta de compromisso/movimento da Aura (vs evasiva, mudou de assunto, ou ignorou).

Conserta o falso-positivo do `commitmentQuestionDetected` atual (L1345), que desarma a rede de segurança só porque a Aura perguntou — sem checar se o usuário respondeu.

### 1.4. Relaxar o freio rígido de pares (L1275)

- Hoje: `recentPairs < 4` força `presenca`.
- Novo: `recentPairs < 4 AND information_density !== 'saturated'` força `presenca`.

Se o usuário entregou os três elementos em 2 mensagens densas, o evaluator pode avançar.

### 1.5. Nudge intermediário (preencher o "Vale da Morte" 10–25 min)

Aos ~15 min, **se E somente se** `information_density === 'saturated'` E ainda em `presenca`, sugerir suavemente avanço para reframe — **como nota descritiva** no PHASE_INSTRUCTIONS, não AÇÃO OBRIGATÓRIA.

Sem o gate de `saturated`, vira outra muleta de clock — é exatamente o que estamos tentando eliminar.

## Fase 2 — Validação determinística (análise estática)

Estender `phase_thresholds_test.ts` com 5 cenários:

- **A**: usuário denso (2 pares, `saturated`) → avança para `sentido` sem esperar 4 pares.
- **B**: usuário evasivo (8 pares, `low`) → permanece em `presenca`, NÃO avança por contagem.
- **C**: usuário entra em modo reflexivo sozinho (`user_reflection_mode=true`) → evaluator marca `sentido` mesmo sem keyword da Aura.
- **D**: Aura perguntou compromisso, usuário ignorou (`user_engaged_with_commitment=false`) → rede de segurança continua armada.
- **E**: Aura perguntou compromisso, usuário respondeu concretamente (`user_engaged_with_commitment=true`) → rede de segurança desarma.

Só passa para Fase 2.5 com todos os 5 cenários verdes.

## Fase 2.5 — Validação em produção (5–10 sessões reais)

**Crítica e nova.** A Fase 2 valida lógica determinística, mas não valida se o Flash-lite está classificando os sinais corretamente em conversa real.

Após Fase 1 em produção, coletar 5–10 sessões reais e verificar manualmente nos logs:

- `information_density` está marcando `saturated` apenas quando os 3 elementos realmente apareceram?
- `user_reflection_mode` está marcando `true` apenas em reflexão genuína, não em "ah, faz sentido"?
- `user_engaged_with_commitment` distingue resposta concreta de evasiva?

**Critério de prosseguimento:** ≥80% de classificação correta nos três sinais. Abaixo disso, refinar prompt do micro-agente e repetir — **não** prosseguir para Fase 3.

Se algum sinal ficar instável, a Fase 3 não acontece — as muletas continuam como rede de proteção até o evaluator merecer confiança.

## Fase 3 — Desarmar as muletas no prompt

Com o evaluator transicionando bem sozinho e os sinais validados em produção, as muletas viram redundância.

**Substituir (não remover bruto):**
- **C9 (`AÇÃO OBRIGATÓRIA AGORA`)** → "Você está na janela de reframe e o conteúdo está saturado — se houver leitura possível, ofereça como hipótese; se ainda não houver, continue investigando uma camada mais profunda."
- **C10 (`REDE DE SEGURANÇA — FECHAMENTO OBRIGATÓRIO`)** → "Faltam X minutos e ainda não houve aterrissagem em passo concreto — quando o material permitir, amarre."

**Remover sem substituir:**
- C7 (`DEVE entregar após 2-3 trocas`) — coberto por `information_density`.
- C8 (`GUARDRAIL SIMÉTRICO a cada 4 trocas`) — clock puro, redundante.
- C1 ("vá MAIS FUNDO no mesmo tema") — instrução de tom errado.
- C2 (few-shot "vou te provocar quando precisar") — template dramático.
- C5 ("Isso é a superfície. O que está por baixo?") — template de pressão.
- A2, A4, A6, A9 conforme rodada anterior.

## Critério de sucesso (smoke test pós-Fase 3)

Em sessão real:
- Evaluator avança presenca→sentido antes de 4 pares quando há saturação
- Aura não dispara "Isso é a superfície" nem "vá mais fundo"
- Reframe emerge quando há material, não por clock
- Fechamento emerge quando usuário se engajou; rede de segurança só dispara em vácuo real
- Sem anúncios de "estamos na metade da sessão"

## Fora de escopo

- Não trocar evaluator de determinístico para LLM (custo, latência, perda de previsibilidade).
- Não mexer em `SESSION_PHASE_INSTRUCTIONS` estrutural — só os blocos dinâmicos C1–C10.
- Não mexer no áudio obrigatório (C3, C6) — decisão de produto separada.
- Não mexer no roteamento de modelo (Flash 3 Preview continua).

## Risco principal

A definição estrita de `information_density` é o ponto mais delicado. Se o Flash-lite for permissivo demais, `saturated` dispara cedo e a Fase 1 quebra mais do que conserta. A Fase 2.5 (validação manual em produção) é a rede de segurança contra isso — sem ela, é tentação prosseguir cego para a Fase 3.