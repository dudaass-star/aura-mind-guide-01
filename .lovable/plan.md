## Objetivo

Despoluir o `aura-agent/index.ts` removendo ~30 linhas de ruído que vazam para conversas casuais (saudações, "Oi" fora de sessão). Risco baixíssimo: 4 edits cirúrgicos em 1 arquivo, todos com fallback óbvio.

Fase 2B (mover blocos pesados de `# SESSÕES ESPECIAIS` para dinâmico) fica **adiada** até validar 2A em produção — alinhado com a ressalva sobre exemplos de sessão boa/ruim e regras de brevidade que precisam permanecer durante toda sessão.

---

## FASE 2A — 4 edits cirúrgicos

Arquivo: `supabase/functions/aura-agent/index.ts`.

### 2A.1 Remover stub `## CONTROLE DE TEMPO DA SESSÃO` (linhas 2961-2962)

Apenas 2 linhas apontando "consulte o bloco DADOS DINÂMICOS". O bloco dinâmico já existe completo. Deleção direta.

### 2A.2 Colapsar `🟢 CONFIRMAÇÃO DE PLANO ATUAL` — **tratamento separado por caso**

Dois casos distintos no bloco atual:

**Caso 1 — usuário tem sessões disponíveis** (linhas ~5937-5949):
Colapsar em 1 linha dentro do `## Dados do Usuário` existente (linhas 5305-5312):
```
- ⚠️ Plano CONFIRMADO: "${userPlan}" com ${sessionsAvailable} sessão(ões) ativa(s). IGNORE qualquer menção a upgrade/checkout no histórico.
```

**Caso 2 — cota esgotada** (linhas ~5952-5964):
**Manter como bloco condicional separado**, mas enxuto (3-4 linhas em vez de 12). Conteúdo essencial:
```
## SESSÕES ESGOTADAS NO CICLO
- Plano "${userPlan}" já consumiu as ${planConfig.sessions} sessões deste ciclo.
- Se o usuário pedir sessão: reconheça, explique que reabre no próximo ciclo (${nextCycleDate}), ofereça continuar a conversa pelo chat agora.
- NÃO sugira upgrade nem checkout. Direcione para /meu-espaco se ele pedir detalhes do plano.
```
Esse bloco fica injetado apenas quando `planConfig.sessions > 0 && sessionsAvailable === 0`.

### 2A.3 Condicionar `🔚 FECHAMENTO RECOMENDADO` (linhas 5566-5622)

Trocar `if (closureRoute !== 'none')` por gate real:
```ts
const closureGateOk = sessionActive || phaseEval?.detectedPhase === 'movimento';
if (closureRoute !== 'none' && closureGateOk) {
  // injeta bloco
}
```

Fora de sessão e fora de fase movimento, o bloco não injeta — remove um dos vetores de "puxar tema antigo no Oi".

### 2A.4 Remover `## REGRAS DE CONTINUIDADE (OBRIGATÓRIAS)` duplicado (linhas 5408-5424)

Bloco tem scripts literais já identificados como problemáticos ("Na nossa última conversa você tinha falado sobre X..."). A instrução de abertura com fio condutor já vive em `calculateSessionTimeContext` fase opening (linhas ~5611-5616) com mais qualidade.

Deleção do bloco duplicado. Os outros 2 caminhos (estático `# SESSÕES ESPECIAIS` e dinâmico fase opening) permanecem intactos.

---

## Validação

1. Deploy do `aura-agent` (validar drift via `failed_message_log` em 5 min, padrão da memória de deploy).
2. Cenário "Oi" de usuário pago com sessões disponíveis → resposta sem `REGRAS ABSOLUTAS`, sem bloco de fechamento, sem script de continuidade.
3. Cenário usuário com cota esgotada pede sessão → resposta usa as 3-4 linhas do bloco "SESSÕES ESGOTADAS", reconhece e redireciona.
4. Cenário dentro de sessão fase reframe → fechamento e continuidade continuam aparecendo via caminhos preservados.
5. Cenário "Oi" com compromissos pendentes em chat livre → fechamento NÃO injeta (combinado com Fase 1).

---

## Fase 2B — adiada (não implementar agora)

Documentar como follow-up:

- Antes de mover `# SESSÕES ESPECIAIS (MODO SESSÃO)` (linhas 2861-2973) para o dinâmico, separar:
  - **"Sempre útil em sessão"**: exemplos de sessão boa/ruim, regras de brevidade, tabela Sessão×Conversa → permanecem ou viram bloco único injetado quando `sessionActive === true`.
  - **"Útil só em fase X"**: técnicas de Logoterapia (reframe), instruções de abertura, fechamento clínico → injetar por fase via `phaseInfo.phase`.
- Reavaliar depois de 1-2 semanas de Fase 1 + 2A em produção. Se a queixa de "puxar tema antigo" sumiu, 2B vira otimização de custo/contexto, não correção de bug.

---

## Arquivos da Fase 2A

- `supabase/functions/aura-agent/index.ts` — 4 edits localizados.
- `mem/persona/abertura-leve-casual.md` — adicionar nota sobre fechamento condicionado e remoção de continuidade duplicada.

## Rollback

1 commit, edits localizados. `git revert` reverte 100%.

## Riscos

- 2A.2 Caso 2: se `nextCycleDate` não estiver disponível no escopo onde o bloco é montado, ajustar para usar fallback genérico ("no próximo ciclo do seu plano") sem quebrar.
- 2A.3: `phaseEval` precisa estar no escopo onde o gate é avaliado. Se não estiver, simplificar para `sessionActive` apenas (mais conservador, mesmo efeito principal).
