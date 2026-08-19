---
name: Aura útil no dia a dia (papo prático)
description: Escopo em 2 níveis (papo do dia a dia liberado, entrega regulada proibida), utilidade no PING-PONG até 800 chars, isPracticalQuestion e corte de assunto em 30 min
type: feature
---
Objetivo: Aura também é **companhia útil** no dia comum (aumenta LTV, cria hábito diário) — não só presença clínica. Ajuste enxuto, só prompt + 4 pontos de lógica em `aura-agent/index.ts`.

## Escopo em 2 níveis (substituiu `# ESCOPO E LIMITES (O QUE VOCÊ NÃO FAZ)`)
- **Nível 1 — pode e deve ajudar:** receita, rotina/organização, filme/livro/presente, como funciona algo, opinião sobre decisão comum, comparação simples (pilates x musculação), ajudar a escrever mensagem difícil, gastos do dia a dia. Lista é exemplo, não limite.
- **Nível 2 — continua NÃO:** diagnóstico/medicação, plano de dieta/macros, investimento/imposto, parecer jurídico, código/prompt/agente, plano de marketing. Nomeia o limite em 1 frase + sugere profissional. "Não é bem minha praia" só vale aqui.

## Utilidade no PING-PONG
Pergunta prática entra como sinal de PING-PONG. Teto sobe de 300 para ~800 chars (5 balões continuam). Responder é a entrega: sem gancho emocional, sem pergunta de volta, sem leitura psicológica.

## `isPracticalQuestion()` (função pura, exportada)
Ordem obrigatória: `EMOTIONAL_LOAD_REGEX` → `REFLEXIVE_QUESTION` → `PRACTICAL_OPENER` → `endsWith('?')`. As exclusões rodam ANTES de qualquer `return true` (senão o `||` curto-circuita).
- **Regra de manutenção:** só entra em `PRACTICAL_OPENER` termo que NÃO possa iniciar frase afirmativa de desabafo. `pode`, `posso`, `dá pra` ficam FORA ("posso não aguentar mais isso").
- `endsWith('?')` é o pega-tudo: assunto fora de qualquer lista e erro de digitação passam. As listas que restringem erram pro lado do acolhimento.
- Usada em 2 lugares onde errar é inofensivo: saída antecipada do phase evaluator e (indiretamente) o gate de abertura leve.
- `EMOTIONAL_LOAD_REGEX` virou módulo-level, expandido com termos relacionais (`sumi|gosta de mim|tra[ií]|termin|brig|ignor|ciúm|...`) e com lookbehind `(?<!faz )\bmal\b` para não engolir "faz mal tomar café a noite?".

## Gate de abertura leve
`## ABERTURA LEVE DETECTADA` agora dispara **só em saudação pura**. O ramo antigo (≤8 palavras sem carga emocional) engolia pergunta prática curta. A blindagem contra puxar tema antigo migrou pro `LEMBRETE ANTI-ECO`, que subiu de ≤5 para ≤8 palavras e ganhou a proibição de referenciar memória/insights/compromissos.

## Corte de assunto em 30 min (fora de sessão)
`temporalGapHours` dispara em `>= 0.5` (antes 4). Faixa 30min-4h fora de sessão: **a mensagem atual do usuário define o assunto**; a Aura não reabre o tema anterior por conta própria, mas retoma com tudo se ELE puxar. Dentro de sessão ativa, nada muda.

Teste: `supabase/functions/aura-agent/practical_question_test.ts` (7 testes, inclui adversariais com modal e regressão de crise).
