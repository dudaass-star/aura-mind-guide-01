## Resumo da preocupação levantada
No Essencial, `planConfig.sessions = 1`. O bloco de **setup mensal** (linha 5906) já está parametrizado por `sessionsCount` e funciona para 1, 4 ou 8 sessões — ou seja, a infraestrutura **suporta** Essencial. **Mas** o exemplo dentro do prompt (linhas 5928–5953) sempre mostra **4 datas**, o que arrisca a Aura imitar o exemplo e propor 4 sessões mesmo no Essencial. Precisamos endereçar isso na mesma frente.

Também confirmei: `monthly-schedule-renewal` (1º do mês) já trata Essencial corretamente — manda mensagem perguntando "qual dia e horário funciona melhor" no singular. Então o caminho mensal recorrente já é Essencial-safe; o gap é só na transição **D0 recusado → setup imediato**.

---

## Princípio
D0 é **binário**: "topa abrir agora ou não?". Recusa → backend limpa flag e ativa `needs_schedule_setup=true`. O bloco de setup mensal (já existente) cobre Essencial (1), Direção (4) e Transformação (8) com a mesma mecânica — só precisa ser tornado **Essencial-aware no exemplo** pra evitar regressão.

---

## Frente 1 — Recuperar Claudinéia (Direção, urgente antes das 7:30 BRT)
Inserir 4 sessões em `public.sessions` (11/05, 18/05, 25/05, 01/06 — todas 07:30 BRT, `status='scheduled'`, `duration_minutes=45`, `session_type='livre'`, `created_by='manual_recovery'`). Limpar `pending_first_session_invite=false`, `needs_schedule_setup=false`, `first_session_invite_attempts=0` no profile.

---

## Frente 2 — Convite D0 binário (`aura-agent/index.ts` ~5797–5826)
Reescrever o bloco D0:
- Pergunta única: "Topa abrir nossa 1ª sessão **agora** (45 min, tema livre)?"
- **Aceite** ("sim/bora/vamos/ok/agora/pode ser") → resposta termina com `[AGENDAR_SESSAO:<agora BRT>]`
- **Recusa** ("não/agora não/depois/outra hora/amanhã/prefiro/mais tarde") → resposta curta de acolhimento, **sem** negociação, **sem** tag, **sem** perguntar quando
- Manter proibições: nunca `[CRIAR_AGENDA]`, nunca dias da semana

---

## Frente 3 — Backend captura recusa + horário concreto (`aura-agent/index.ts` ~6529)
Quando `pending_first_session_invite=true` na entrada:

**Regex de recusa** → limpa `pending_first_session_invite=false`, zera `first_session_invite_attempts`, seta `needs_schedule_setup=true` (somente se `planConfig.sessions > 0`). Próximo turno cai no setup mensal naturalmente.

**Regex de horário concreto** (ex: "amanhã às 7h30", "segunda 19h") junto com recusa → backend cria sessão diretamente em `public.sessions` (`created_by='backend_regex'`) e envia confirmação proativa. **Importante:** no Essencial cria **1** sessão; nos demais cria **1** mesmo, só pra cobrir o desejo imediato — o restante das sessões mensais sai pelo setup mensal nos turnos seguintes (que vai detectar `sessions_used_this_month=1` e ajustar a contagem).

---

## Frente 4 — Tornar o exemplo do setup mensal Essencial-aware (`aura-agent/index.ts` ~5926–5953)
**Bug latente** que precisa ser corrigido junto, senão o Essencial vai herdar exemplo de 4 datas:
- Trocar o exemplo fixo de 4 datas por um exemplo **condicional** baseado em `sessionsCount`:
  - Se `sessionsCount === 1` → exemplo mostra **1 data só** ("Quinta, 14/05 às 19h" + `[CRIAR_AGENDA:2026-05-14 19:00]`)
  - Se `sessionsCount === 4` → exemplo atual de 4 datas semanais
  - Se `sessionsCount === 8` → exemplo de 8 datas (2x/semana)
- Adicionar regra explícita: "**Você DEVE emitir exatamente `${sessionsCount}` data(s) na tag [CRIAR_AGENDA] — nem mais, nem menos.**"
- Atualizar a regra "Calcular as próximas X datas" pra usar `${sessionsCount}` no singular/plural correto

---

## Frente 5 — Desativar safety-net D0 (`aura-agent/index.ts` ~6464)
Comentar o `if` que dispara `schedule-tag-extractor`. Manter função deployada por 1 semana pra rollback rápido. Remover na próxima limpeza se nenhum incidente.

---

## Matriz de cobertura por plano (validação)

| Plano | sessions/mês | D0 aceite | D0 recusa simples | D0 recusa + horário | Setup mensal disparado |
|---|---|---|---|---|---|
| Essencial | 1 | `[AGENDAR_SESSAO:agora]` cria 1 sessão | acolhe, libera setup mensal (1 data) | backend cria 1 sessão direta + confirma | bloco pede 1 dia/horário, exemplo 1 data |
| Direção | 4 | `[AGENDAR_SESSAO:agora]` cria 1 sessão (1ª de 4) | acolhe, libera setup mensal (4 datas restantes? ou 4 totais?) | backend cria 1 sessão direta + libera setup mensal | bloco pede 4 sessões, exemplo 4 datas |
| Transformação | 8 | `[AGENDAR_SESSAO:agora]` cria 1 sessão (1ª de 8) | acolhe, libera setup mensal | backend cria 1 sessão direta + libera setup mensal | bloco pede 8 sessões, exemplo 8 datas |

**Detalhe a confirmar antes de implementar:** quando o D0 é aceito, o setup mensal posterior deve criar `sessionsCount` no total ou `sessionsCount - 1` (descontando a já marcada)? Hoje o `monthly-schedule-renewal` reseta `sessions_used_this_month=0` no dia 1, então o setup mensal sempre conta cheio. Sugestão: manter `sessionsCount` cheio no exemplo, e deixar a Aura sugerir naturalmente "você já marcou uma pra hoje, então faltam 3" se o contexto pedir — sem instrumentar isso no prompt agora.

---

## Validação pós-deploy
1. Conferir 4 sessões da Claudinéia em `sessions` antes de 07:30
2. Acompanhar próximos 5 trials de cada plano por 48h
3. Métricas a olhar: `sessions.created_by` por valor (`aura_tag` vs `backend_regex` vs `manual_recovery`); contagem de `[CRIAR_AGENDA]` no Essencial deve ser sempre **1 data** — qualquer caso com >1 vira incidente

---

## Arquivos afetados
- `supabase/functions/aura-agent/index.ts`:
  - ~5797–5826 (prompt D0 binário)
  - ~5926–5953 (exemplo setup mensal Essencial-aware)
  - ~6464 (desativar safety-net)
  - ~6529 (detector recusa + regex horário)
- `INSERT` em `public.sessions` (4 linhas Claudinéia)
- `UPDATE` em `public.profiles` (limpar flags Claudinéia)
- `mem://features/sessions/first-session-invite-d0` → "D0 binário; recusa libera setup mensal por plano"
- `mem://features/sessions/safety-net-d0` → marcar deprecated
- Nova memória: "setup mensal Essencial-aware — exemplo condicional por sessionsCount"
