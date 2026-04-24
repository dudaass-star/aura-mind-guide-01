## Objetivo

Avaliar como a Aura está performando para os **10 assinantes mais recentes** (todos em status `trial` pago, criados entre 20/04 e 24/04). Cruzar comportamento real com a configuração que definimos (fases de sessão, método Logoterapia/Estoicismo/Socrático, persona, regras anti-acolhimento, geração de insights/compromissos, segurança).

Entrega: **diagnóstico executivo de 1 página em markdown, direto no chat.**

## Os 10 assinantes em análise

| # | Nome | Plano | Sign-up | Msgs (user/Aura) | Sessões | Compromissos | Temas |
|---|---|---|---|---|---|---|---|
| 1 | Aline Mendes | Transformação | 24/04 | 10 / 35 | 0 | 1 | 4 |
| 2 | Ideline Pecori | Direção | 24/04 | 48 / 106 | 4 | 18 | 14 |
| 3 | Kelvin Amorim | Essencial | 24/04 | 22 / 48 | 0 | 2 | 2 |
| 4 | Brandon Galvão | Direção | 23/04 | 12 / 31 | 4 | 7 | 6 |
| 5 | Marciel S. Costa | Direção | 23/04 | 21 / 60 | 4 | 6 | 5 |
| 6 | Anderson S. de Jesus | Direção | 23/04 | 51 / 180 | 4 | 39 | 12 |
| 7 | Cristiane | Direção | 23/04 | 58 / 118 | 0 | 21 | 8 |
| 8 | Jessica Lima | Direção | 22/04 | 7 / 18 | 0 | 2 | 2 |
| 9 | Luciana Fetter | Essencial | 22/04 | 5 / 15 | 0 | 2 | 7 |
| 10 | Sara S. Dias | Direção | 21/04 | 36 / 96 | 4 | 18 | 9 |

Observação preliminar: **0 ratings** registradas em todos. Vale investigar se o gatilho de `rating_requested` está sendo disparado.

## O que vou fazer

### 1. Coleta quantitativa (já temos a base, complementar)
- Por usuário: msgs/dia, dias ativos, gap desde última msg, ratio Aura/usuário (verbosidade), profundidade média do user_msg (chars), distribuição de horários.
- Sessões: agendadas vs completadas vs com summary, lembretes enviados, presença de insights e compromissos por sessão.
- Sinais de churn: gap >48h, mensagens curtas decrescentes, ausência de retorno após follow-up.

### 2. Análise qualitativa por amostragem
Para cada um dos 10, ler:
- Primeiras 10 mensagens (qualidade da abertura, mapeamento situacional, tom).
- 10 mensagens do meio (aderência às fases, perguntas socráticas, reframes, evitação de acolhimento automático).
- Últimas 10 mensagens (fechamento, geração de compromisso, gancho para próxima sessão, sinal de engajamento ou frustração).
- Resumos de sessão e insights gravados (qualidade da síntese, alinhamento com o método).

### 3. Avaliação contra as regras de persona
Cruzar com as memórias-chave do projeto:
- `padroes-qualidade-terapeutica` — Exploração ≥7 pares antes de reframe; presença antes de técnica.
- `proportional-reaction-standard` — sem acolhimento automático, reação proporcional.
- `base-metodologica` — Logoterapia + Estoicismo + Socrático.
- `surgical-safety-protocol` — detecção e tratamento de ideação.
- `upgrade-cta-governance` — sem upgrade em crise.
- `meditation-offering-rules` — não oferecer como fuga.
- `interpersonal-conflict-protocol` — sem demonizar terceiros.
- `session-lifecycle-architecture` — abertura/exploração/reframe/fechamento.

### 4. Diagnóstico executivo
Estrutura final entregue no chat:

```
## Diagnóstico — 10 últimos assinantes

### Tabela semáforo (1 linha por usuário)
Nome | Engajamento | Qualidade terapêutica | Aderência método | Risco churn | Observação curta

### Top 5 problemas sistêmicos detectados
(padrões que aparecem em múltiplos usuários — ex: "0 ratings em 10/10",
"sessões agendadas mas summary não gravado em X casos", "Aura verbosa demais
no plano Essencial", etc.)

### Top 3 acertos
(o que está funcionando bem e deve ser preservado)

### Recomendações priorizadas (3-5 ações)
Ordem de impacto × esforço, com ação concreta.
```

## Detalhes técnicos da execução

- Queries SQL em `messages`, `sessions`, `session_themes`, `commitments`, `session_ratings`, `profiles`, `aura_response_state`, `conversation_followups`.
- Leitura amostrada de `messages` por usuário (não vou copiar tudo no relatório — só citar padrões).
- Sem mudanças de código nem migrations. Apenas leitura.
- Sem geração de PDF (entrega é markdown no chat).

## Limitações assumidas
- Análise é amostral nas conversas (10 + 10 + 10 mensagens por usuário) — não 100% das mensagens.
- "Qualidade terapêutica" é avaliação heurística contra as regras de persona, não validação clínica.
- 4 dos 10 têm <24h de uso — sinais ainda parciais.
