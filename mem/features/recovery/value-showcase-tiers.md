---
name: Vitrine de valor em 3 níveis (recovery-agent)
description: VALUE_SHOWCASE hierarquizado — memória e conveniência são pressupostos (nível C), nunca argumento de venda; cenas de desejo (A) são a escolha padrão
type: feature
---
Vitrine do `recovery-agent/index.ts` reorganizada em 3 níveis de desejo (ago/2026, após o agente pitchar "memória de longo prazo" como grande diferencial pra Rosemeire).

- **Nível A — CENAS QUE GERAM DESEJO** (escolha padrão): encontro guiado 45min, meditações guiadas a qualquer momento, jornadas de conhecimento/trilha semanal. Textos em cena, primeira pessoa, presente ("você escreve que não consegue dormir e em segundos chega um áudio").
- **Nível B — PROVAS DE APOIO**: falar por áudio, resposta a qualquer hora, portal /meu-espaco. Só como reforço de uma cena A, nunca argumento principal.
- **Nível C — PRESSUPOSTOS (NÃO VENDA)**: memória de longo prazo. O lead já espera isso — só mencionar se ELE perguntar. "Madrugada sem ninguém" também rebaixada pra B (poucos buscam a Aura por isso).

Cada item tem `tier: A|B|C`; `renderValueShowcase()` renderiza 3 blocos rotulados e mantém `[JÁ CITADO — não repita]`. Instrução no contextBlock: nunca abrir mensagem por nível C; se cenas A já citadas, aprofundar com detalhe novo em vez de descer pra B/C.
