---
name: Resumo evolutivo narrativo do usuário
description: Terceira camada de memória da AURA. Resumo curto até 600 chars sobre quem é o usuário, gerado por Flash-Lite a cada 20 msgs ou 24h, com regras anti-conexão e respeito a correções.
type: feature
---

# Resumo Evolutivo Narrativo

Tabela: `user_evolution_summary` (uma linha por usuário).
Campos: `summary_text` (até 600 chars), `last_generated_at`, `messages_count_at_generation`, `generation_count`.

## Geração

- Função: `regenerateEvolutionSummary` em `supabase/functions/aura-agent/index.ts`.
- Modelo: `google/gemini-2.5-flash-lite`.
- Trigger: `maybeTriggerEvolutionSummary` rodando dentro de `EdgeRuntime.waitUntil` ao final de cada conversa. Regenera se msgs novas >= 20 OU horas decorridas >= 24. Primeira geração precisa >= 6 msgs.
- Input: últimas 80 mensagens + top 30 insights + todas as correções + temas ativos. Nunca lê o summary anterior (evita deriva).

## Regras anti-confabulação no prompt

- Cada insight é fato isolado — proibido conectar entre si.
- Lista de conectivos proibidos: "relacionado a", "ligado a", "em torno de", "decorrente de", "especialmente quando", "por causa de", "quando se trata de".
- Correções entram como anti-padrões / conexões proibidas, nunca podem ser contraditas.
- Estrutura obrigatória: 3 blocos curtos em frases-fato paralelas (não prosa corrida). Cada frase deve poder ser lida sozinha.
- Limite de 600 chars: hardcoded no prompt + truncamento defensivo no código.

## Injeção no prompt principal

Bloco "Quem é {nome}" injetado em `buildSystemPrompt` logo após o bloco de Correções de Memória, antes de Processo Terapêutico. Marcado como contexto de fundo, não pauta.

## Arquitetura completa de memória

1. `user_insights` — fatos atômicos com prioridade (4-10).
2. `user_memory_corrections` — verdades de prioridade máxima (overrides).
3. `user_evolution_summary` — narrativa curta de quem é a pessoa.

## Validação (backfill orgânico)

Para usuários sem summary, a próxima mensagem dispara geração automática. Critério de qualidade no caso Eduardo: deve conter "age apesar do medo", "prefere conversa livre", e mencionar atividade física/ansiedade em frases separadas (sem conectivo causal).
