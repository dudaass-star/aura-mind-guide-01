---
name: recovery-agent — cena condicional, nunca hipotética
description: Cena do NÍVEL A deixou de ser obrigatória (gatilho + cooldown de 1 mensagem), lead que já decidiu recebe 2 frases, e enquadramento hipotético ("imagina", "pensa no dia em que") é proibido e removido no pós-processamento
type: feature
---
Origem (05/09/2026): conversa da Ana Paula — ela já tinha dito "Sim segunda vou fazer" e "Ok até segunda" e recebeu duas mensagens longas seguidas com cena hipotética ("E já pensando nos primeiros dias...", "Mas já pra ir imaginando, pensa no dia em que...").

Regras vigentes em `supabase/functions/recovery-agent/index.ts`:

- **Cena não é mais obrigatória.** A regra das "DUAS camadas" virou condicional: `sceneTrigger` exige gancho real na fala do lead (pergunta, dúvida, preço, objeção, ansiedade/sono/tempo, identidade) e `sceneUsedRecently(historyAsc)` bloqueia cena quando a última mensagem nossa já trouxe uma. `sceneInstruction` injeta "SEM CENA NESTA MENSAGEM" ou "CENA LIBERADA".
- **`isDecided(text)`** (intenção futura declarada: "vou fazer/assinar", "até segunda", "depois eu faço", sem "?" nem objeção, ≤160 chars) → `decidedInstruction`: máximo 2 frases confirmando, sem vitrine (bloco `O QUE ... GANHA` não é renderizado), sem PIX, sem taster, sem link (`sendLink`/`offerTaster` forçados a false) e sem tag.
- **Proibido enquadramento hipotético**: instrução explícita contra "imagina", "pensa no dia em que", "já pensando nos primeiros dias", "vamos supor", "suponha", "quando bater X". Rede de segurança `RE_HYPOTHETICAL` remove por frase/parágrafo no pós-processamento (ao lado de `RE_DIMINISH`).
- `isShortGreeting` ampliado: até 5 palavras e tokens de fechamento ("sim", "beleza", "perfeito", "combinado", "certo", "entendi", "fechado", "tá").
- Teto de tamanho: 5 frases só em explicação de PIX/valor; nos outros casos 3 frases e UM parágrafo.
