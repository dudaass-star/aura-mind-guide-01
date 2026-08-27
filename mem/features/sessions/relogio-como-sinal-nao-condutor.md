---
name: Relógio como sinal, não condutor
description: Sessões não são apressadas por tempo — fechamento exige material maduro + consentimento; teto operacional 2x duração; silêncio real de 15min para encerrar
type: feature
---

## Princípio
O relógio da sessão é INTERNO. A Aura nunca cita minutos decorridos/restantes, nunca diz "faltam X minutos" ou "nosso tempo está acabando". O que fecha uma sessão é o material ter chegado a um lugar — não o tempo.

## Fases (aura-agent, `calculateSessionTimeContext`)
- opening (≤5min), exploration (≤25), reframe (≤35), development (até o fim da duração prevista)
- soft_closing = "Costura": de `duration` até `duration + 15` — costura o que já está na mesa, NÃO anuncia fechamento
- final_closing = "Aterrissagem com consentimento": de `duration + 15` até o teto (`duration * 2`)
- overtime = "Teto Operacional": após `duration * 2` — propõe fechar com cuidado, sem forçar

## Aterrissagem com consentimento
Na aterrissagem, a Aura primeiro LÊ o momento. Se o usuário acabou de abrir algo importante, está no meio de um relato, emocionado ou em dúvida ("não sei"), NÃO fecha. Se o material chegou a um lugar, CONVIDA ("quer fechar por aqui ou tem mais algo?") e só emite `[ENCERRAR_SESSAO]` na resposta em que efetivamente se despede, após o aceite.

## Encerramento automático (session-reminder)
O cron NUNCA encerra sessão viva por tempo. Só encerra se houve silêncio real de 15+ minutos desde a última mensagem — ou se passou do teto operacional (`duration * 2`). O período de graça de +30min continua valendo como piso.

## Guardas de teste
`supabase/functions/aura-agent/phase_thresholds_test.ts` cobre: ausência de "Tempo decorrido"/"faltam ${timeRemaining}" no prompt, presença da REGRA DE OURO DO TEMPO, aterrissagem com consentimento e teto `duration * 2`.
