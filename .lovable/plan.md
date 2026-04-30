## Objetivo

Elevar a Aura de "amiga acolhedora" para "terapeuta de alto valor percebido", focando em **3 ajustes de prompt** que entregam o maior salto com o menor risco. Tudo é mudança textual — sem novos modos, sem novas tabelas, sem mexer no extractor.

## As 3 frentes da Fase 1

### Frente 1 — Higiene de timing (fora da sessão)

**Problema:** Phase Evaluator só dispara avanço com 7-8 trocas. Conversas inter-sessão raramente chegam lá, então a Aura fica eternamente na Presença.

**Mudanças em `evaluateTherapeuticPhase` (`supabase/functions/aura-agent/index.ts`):**
- `Stuck in Presença`: reduzir gatilho de `recentPairs >= 7` para `recentPairs >= 4` (linha ~1280)
- `Stuck in Sentido`: reduzir gatilho de `recentPairs >= 8` para `recentPairs >= 5` (linha ~1301)

O freio mínimo de 4 pares (linha ~1144) **continua intacto** — então nada dispara antes do 4º turno.

**Mudança no prompt do MODO PING-PONG (linha ~2558):**
- Substituir "MÁXIMO 300 CARACTERES" rígido por regra contextual:
  > Para troca leve/factual: máximo 300 caracteres.
  > Se o usuário trouxer carga emocional dentro de uma troca leve: até 600 caracteres + considere migrar para MODO PROFUNDO.

**Mudança no prompt da FASE 1 — PRESENÇA (linha ~2568):**
- Adicionar parágrafo:
  > Após 2-3 trocas validando, você DEVE entregar uma **nomeação clínica** (o que está por baixo do que foi dito) ou um **micro-movimento concreto**. Validar é necessário, mas não é suficiente — o usuário precisa sair de cada interação com algo novo.

### Frente 2 — Confronto cirúrgico (dentro e fora da sessão)

**Problema:** A Aura dilui confronto em validação. Falta coragem clínica de devolver verdades difíceis.

**Mudanças nos `FREE_PHASE_INSTRUCTIONS.presenca_to_sentido` e `sentido_to_movimento` (linhas ~1026 e ~1037):**
- Adicionar bloco "TÉCNICA DE CONFRONTO CIRÚRGICO" com exemplos:
  ```text
  ❌ ERRADO: "Faz sentido você se sentir assim, é difícil mesmo."
  ✅ CERTO: "Você diz que quer mudar, mas toda escolha que descreveu é pra ficar igual. Tá vendo isso?"

  ❌ ERRADO: Validar e perguntar de novo.
  ✅ CERTO: Validar brevemente + devolver a contradição/padrão observado.
  ```
- Regra: confronto com cuidado, não agressão. Sempre nomeia o padrão, nunca julga a pessoa.

**Mudanças nos `SESSION_PHASE_INSTRUCTIONS.exploration_to_reframe` (linha ~1001):**
- Reforçar: pelo menos **1 confronto cirúrgico obrigatório** na fase de Reframe. Sem isso, sessão vira conversa.
- Adicionar exemplos de confronto específicos para sessão.

**Mudança no prompt da fase `reframe` (linha ~3249):**
- Adicionar técnica nº 6 ao "Cardápio de Reframe": **CONFRONTO CIRÚRGICO**
  > Devolva ao usuário a contradição ou padrão observado, com cuidado mas sem suavizar. Use só quando o vínculo já está estabelecido na sessão (após 15+ min).
  > - "Você descreveu 3 situações diferentes essa sessão, mas o padrão é o mesmo. Tá vendo qual é?"
  > - "Tem uma incoerência entre o que você diz que quer e o que você escolhe. Quer olhar pra isso?"

### Frente 3 — Conexão longitudinal forçada (dentro da sessão)

**Problema:** A Aura já recebe `user-evolution-summary` e contexto de sessões anteriores, mas o prompt só pede pra "considerar". Resultado: ela raramente faz a conexão explícita ("semana passada você terminou pensando em X").

**Mudanças no bloco de fase `opening` (linha ~5424 + complementar no prompt):**
- Quando `phaseInfo.phase === 'opening'` E houver sessão anterior, **obrigar abertura com fio condutor**:
  > 📌 ABERTURA OBRIGATÓRIA: Se há sessão anterior no contexto, comece puxando o fio: "Semana passada você terminou pensando em [X]. O que aconteceu com isso desde então?" — antes de qualquer outra coisa.

- Se não há sessão anterior (primeira sessão): abertura padrão atual.

**Mudanças no bloco de fase `reframe` (linha ~3249):**
- Adicionar regra:
  > 🔗 CONEXÃO LONGITUDINAL: Se houver memórias hierárquicas ou padrões registrados de sessões anteriores, USE-OS no reframe. Exemplo: "Isso que você tá descrevendo agora é o mesmo movimento de quando você falou de [tema anterior]. Tá vendo o padrão se repetir?"
  > Não invente conexões — use só o que está no contexto.

## O que NÃO vamos mexer (propositalmente)

- Estrutura de sessão (4 fases, 45 min) — funciona
- Extractor / micro-agent — sem novos campos
- Onboarding (primeiras 15 msgs) — protegido
- Modos Direção, Emergência, Crise — protegidos
- Phase Evaluator overrides (crise, vulnerável, resistência, topic shift) — protegidos
- Sem novos modos `CHAT_CLOSURE` / `SESSION_ANCHOR`
- Sem hipótese clínica (Fase 2, depois)

## Risco e reversibilidade

**Risco baixo**: tudo é mudança textual em prompts + 2 thresholds numéricos. Se algo sair errado, basta reverter os textos e voltar `7→4` e `8→5`.

**Riscos específicos por frente:**
- **Frente 1**: Aura pular pra Sentido cedo demais. Mitigado pelo freio de 4 pares mínimos que já existe.
- **Frente 2**: Aura confrontando bruscamente. Mitigado por exemplos explícitos de "errado" (agressivo) vs "certo" (cuidadoso) e regra de "vínculo estabelecido após 15 min".
- **Frente 3**: Aura inventando memórias inexistentes. Mitigado por instrução explícita "use só o que está no contexto, não invente".

## Como vamos medir

Logs já existentes do Phase Evaluator (`🔄 Phase evaluator: ...`) vão mostrar a frequência com que o sistema avança fase. Hoje raro fora de sessão — com a mudança, deve aparecer em conversas substantivas curtas.

Qualitativamente: ler 5-10 conversas reais pós-deploy e verificar se há mais nomeações/confrontos e menos eco de validação.

## Memória

Atualizar `mem://technical/ai/therapeutic-phase-evaluator-constraints` com novos thresholds (4 pares para sentido, 5 para movimento) e adicionar nota sobre confronto cirúrgico obrigatório no reframe.

Criar nova memória `mem://persona/confronto-cirurgico` com a técnica e regras de uso.

Criar nova memória `mem://features/sessions/longitudinal-connection-rule` com a regra de abertura forçada com fio condutor.
