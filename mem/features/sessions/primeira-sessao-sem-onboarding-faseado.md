---
name: Primeira sessão sem onboarding faseado
description: Roteiro de 5 fases da primeira sessão foi removido (2026-08-27); primeira sessão roda na condução normal com nota factual curta
type: constraint
---

O roteiro de onboarding estruturado por fases da primeira sessão (welcome → explain → discover → alliance → focus) foi **removido** do `aura-agent` em 27/08/2026. Não reintroduzir.

**Por que:** a fase 5 ("definir foco") não tinha condição de saída e injetava a ordem literal "OBJETIVO: escolher por onde começar" em todos os turnos, gerando loop de pergunta de foco (caso Marilene: 5 repetições). O contador `assistantMessagesInSession` também incluía mensagens de agendamento pré-sessão, então a sessão frequentemente já começava saturada na fase 5.

**Evidência:** 313 sessões concluídas, 99 com nota. 1ª sessão média 4,47 (5 notas ≤3 em 49) vs 2ª+ média 4,80 (2 em 50) — pior em todos os meses medidos. `focus_topic` preenchido em 1 de 136 primeiras sessões.

**Como é hoje:** `firstSessionContext` é uma nota curta e factual — abrir com calor, explicar o formato em uma frase, entender o panorama concreto antes de interpretar, respeitar tema já trazido, e conduzir pelas fases terapêuticas normais.

**Preservado:** `isFirstSession`, marcação de `onboarding_completed` ao fim da 1ª sessão, extração de perfil pós-sessão e o bloco "CONHECIMENTOS DO ONBOARDING" nas sessões seguintes. A remoção foi só do roteiro de condução, nunca da coleta de dados.

**Baseline de acompanhamento:** média das primeiras sessões antes da mudança = 4,47.
