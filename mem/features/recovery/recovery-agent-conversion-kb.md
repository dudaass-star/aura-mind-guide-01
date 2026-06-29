---
name: KB de conversão do recovery-agent
description: Categoria `beneficio` na recovery_knowledge_base sempre injetada no contexto pra reforçar valor antes do link
type: feature
---
`recovery_knowledge_base` tem categoria `beneficio` (meditações guiadas no WhatsApp, sessões 1:1 de 45min, memória de longo prazo, portal /meu-espaco, jornadas, check-in proativo, áudio bidirecional, 24/7). Está incluída em `ALWAYS_CATEGORIES` em `supabase/functions/recovery-agent/index.ts`, então entra no prompt em toda resposta — não depende de keyword match.

SYSTEM_PROMPT do recovery instrui: lead já demonstrou interesse (chegou ao checkout), então quando a dúvida principal estiver respondida, mencionar UM benefício relevante (não listar tudo) antes de mandar [ENVIAR_LINK]. Regra de pagamento (trial só cartão, PIX cheio) também reforçada no prompt — mesma regra do support-agent.