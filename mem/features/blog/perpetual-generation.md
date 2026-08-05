---
name: Blog perpétuo (auto-planner)
description: generate-blog-post reabastece a própria agenda editorial e destrava slots presos; regras de validação que não geram draft silencioso
type: feature
---
- Cron `generate-blog-post-tue-fri` (ter/sex 9h BRT) consome `editorial_calendar`.
- Causa da parada em jul/2026: agenda finita esgotou (0 queued) + 2 slots presos em `generating` + posts virando `draft` por validação.
- Agora a função é autossustentável: (1) `recoverStuckSlots` destrava `generating` > 2h (3 tentativas → failed); (2) `planNextSlots` gera 8 novos slots via Gemini Flash quando a fila esvazia, evitando keywords já usadas, agendando ter/sex; (3) reparo mecânico de title/meta fora de range; (4) keyword conferida sem acento e, em cauda longa (5+ palavras), por tokens.
- Draft só deve sobrar por falha real de conteúdo (curto demais / poucos H2 / FAQ faltando).
