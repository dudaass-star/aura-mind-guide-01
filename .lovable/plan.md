

## Plano: Detecção Inteligente de Marcos de Valor no Trial

### O problema que você levantou

"Faz sentido" ou "entendi" nas primeiras mensagens é apenas educação/confirmação. O verdadeiro "Aha Moment" é quando o usuário **reage emocionalmente após receber algo de valor** — e isso requer contexto, não apenas palavras-chave.

### Solução: Detecção em duas camadas

A detecção precisa combinar **o que a Aura fez** com **como o usuário reagiu**. Não basta analisar a resposta do usuário isoladamente.

**Camada 1 — Tag da Aura: `[VALOR_ENTREGUE]`**

A Aura adiciona essa tag **apenas** quando entrega algo acionável e tangível:
- Um reframe que muda a perspectiva do problema
- Uma técnica prática (respiração, exercício mental, journaling)
- Um insight estruturado sobre o padrão emocional do usuário
- Uma conexão entre sentimentos que o usuário não tinha percebido

A Aura **não** marca como valor entregue:
- Validação emocional simples ("Entendo como é difícil")
- Perguntas abertas ("O que você acha?")
- Acolhimento genérico

Isso é controlado via system prompt — a Aura já é boa em distinguir esses momentos.

**Camada 2 — Resposta do usuário (só avaliada se `trial_phase = 'value_delivered'`)**

Após a Aura marcar `[VALOR_ENTREGUE]`, o webhook analisa a **próxima** resposta do usuário com critérios combinados:

| Critério | Lógica |
|----------|--------|
| Mínimo de mensagens | `trial_conversations_count >= 8` (ignora "faz sentido" precoce) |
| Fase atual | `trial_phase` deve ser `value_delivered` (a Aura já entregou valor) |
| Sentimento positivo | Palavras como: "nossa", "nunca pensei", "caramba", "é verdade", "obrigad", "to melhor", "me ajudou", "fez diferença" |
| Ausência de dúvida | Resposta **não** contém "?" (não está questionando) |

Ou seja: **"faz sentido" na msg 3** → ignorado (fase errada, count baixo). **"faz sentido, nunca tinha pensado assim" na msg 12 após uma técnica** → Aha Moment detectado.

**Fallback de segurança**: Se nenhum Aha for detectado até a msg 42, inicia nudges automaticamente (8 msgs antes do limite hard de 50).

### Fluxo completo

```text
Msgs 1-7:   Escuta ativa. Nota interna apenas.
Msgs 8+:    Aura pode marcar [VALOR_ENTREGUE] quando entregar algo real.
            → webhook salva trial_phase = 'value_delivered'
            → próxima msg do usuário é analisada para Aha
Aha detectado (ou msg 42 fallback):
            → trial_phase = 'aha_reached'
            → +2 msgs: nudge suave ("Tô adorando te conhecer...")
            → +4 msgs: nudge com link
Msg 50 ou 72h: bloqueio final + follow-up sequence
```

### Mudanças técnicas

1. **Migração SQL** — Adicionar `trial_phase text default 'listening'` e `trial_aha_at_count integer` em `profiles`

2. **`aura-agent/index.ts`** — Adicionar tag `[VALOR_ENTREGUE]` ao system prompt com instruções claras do que constitui valor real (técnica, reframe, insight estruturado) vs. o que não é (acolhimento, perguntas). Reescrever bloco de trial (linhas ~3547-3582) com as 4 fases e nudges relativos ao Aha.

3. **`webhook-zapi/index.ts`** — Substituir lógica de 10 msgs por:
   - Limite hard: 50 msgs ou 72h
   - Detecção de `[VALOR_ENTREGUE]` na resposta da Aura → `trial_phase = 'value_delivered'`
   - Análise da resposta do usuário quando `phase = 'value_delivered'` E `count >= 8` → `trial_phase = 'aha_reached'`, salva `trial_aha_at_count`
   - Nudges em `aha_count + 2` e `aha_count + 4`
   - Fallback: nudges na msg 42 e 45 se sem Aha
   - Bloqueio na msg 50 ou 72h
   - Strip `[VALOR_ENTREGUE]` antes de enviar ao usuário

4. **`start-trial/index.ts`** — Atualizar mensagem de boas-vindas (remover "10 conversas")

5. **Frontend** — `TrialStarted.tsx`: trocar "10 conversas" por "suas primeiras conversas"

6. **`execute-scheduled-tasks/index.ts`** — Ajustar follow-ups para msg 50

7. **Admin** — `AdminEngagement.tsx`: atualizar funnel para mostrar fases do trial
