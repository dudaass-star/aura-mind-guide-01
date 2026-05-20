
# Rede de segurança de fechamento no Phase Evaluator

## Problema validado (Alan 1⭐ × Bárbara 5⭐)

Em `supabase/functions/aura-agent/index.ts`, a função `evaluateTherapeuticPhase` (linhas ~1088–1280) tem um **buraco estrutural** no modo sessão:

- Quando `sessionPhase ∈ ('reframe','development')` **e** `detectedPhase === 'sentido'`, **nenhum branch dispara**.
- Só existe nudge de fechamento quando `sessionPhase === 'transition'` (últimos minutos).
- Consequência: se o micro-agente marcar `sentido` cedo, a Aura fica sem orientação tática e **só formula a pergunta de movimento por sorte** — exatamente o que diferenciou Bárbara (formulou no min 27 → 5⭐) de Alan (nunca formulou em 32 min → 1⭐).

`commitments=[]` aconteceu nas duas sessões — então **o extractor não é o culpado**. O diferencial é a pergunta de closure emitida durante a sessão.

## Solução — 3 edições cirúrgicas em 1 único arquivo

### 1. Novo helper: `commitmentQuestionDetected(messageHistory)`
Função pura, sem custo de LLM, ao lado de `evaluateTherapeuticPhase`. Olha as últimas ~6 mensagens da assistente e procura marcadores PT-BR (normalizados, sem acento) como:
`menor passo`, `proximo passo`, `passo concreto`, `que faria sentido como`, `o que voce esta levando`, `compromisso`, `mudar uma coisa pequena`, etc.

Retorna `true` se já houve pergunta de fechamento recente → impede loop.

### 2. Novo branch no Phase Evaluator (modo sessão)
Adicionar dentro do `if (sessionActive && sessionPhase && sessionElapsedMin !== undefined)`, **após** o branch de `transition` e **antes** do `stuck_in_opening`:

```
if (
  ['reframe', 'development'].includes(sessionPhase) &&
  detectedPhase === 'sentido' &&
  !commitmentQuestionDetected(messageHistory) &&
  sessionElapsedMin >= Math.floor(sessionDurationMin * 0.6)
)
```

Quando dispara: injeta `SESSION_PHASE_INSTRUCTIONS.transition_to_closing` com cabeçalho `🛡️ REDE DE SEGURANÇA — FECHAMENTO OBRIGATÓRIO`. `stagnationLevel: 1`.

### 3. Passar `sessionDurationMin` pro evaluator
Adicionar parâmetro opcional `sessionDurationMin: number = 45` na assinatura e propagar do call site (linha ~5899) lendo `currentSession.duration_minutes`.

## Comportamento após o nudge disparar

1. Dispara **1 vez** → Aura formula a pergunta de movimento
2. Próximo turno: detector retorna `true` → **branch não re-dispara** (sem loop)
3. Aura segue o `transition_to_closing` para amarrar e fechar
4. Se usuário evita o passo: `sentido_to_movimento` já tem cláusula de confronto cirúrgico de evitação
5. Tempo expira (`closing`) → ciclo de vida existente assume: `ended_at`, `session-extractor`, rating

## Logs

- `🛡️ Closure safety net fired (elapsed=Xmin, duration=Ymin)` quando o branch dispara
- `✅ Commitment question already detected — skipping safety net` quando o detector pula

## O que NÃO muda

- `session-extractor` e captura de `commitments` permanecem como estão
- Prompts base, micro-agente semântico, contrato de tags e ciclo de vida de sessões intactos
- Modo Livre (fora de sessão agendada) não é afetado
- Branches existentes (`exploration→reframe`, `transition→closing`, `stuck_in_opening`) intocados

## Critério de aceite

1. Replay da sessão do Alan → branch dispara em torno do min 20–27 (Closure injetada)
2. Replay da sessão da Bárbara → branch **não dispara** (ela formulou closure no min 27 → detector retorna `true`)
3. Sessões com `elapsed < 60% da duração` → branch nunca dispara
4. Sem regressão visível em `failed_message_log` após deploy

## Risco

Baixo. **Um único branch determinístico** atrás de 4 condições, dentro de função existente. Não toca prompt principal, não muda persistência, não muda contrato de tags.

## Arquivos

- `supabase/functions/aura-agent/index.ts` (única edição)

## Memória a atualizar após implementação

- `mem://technical/ai/therapeutic-phase-evaluator-constraints` — registrar a nova rede de segurança de closure (60% do tempo + sentido sustentado + sem closure detectada)
