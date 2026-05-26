## Contexto

Direção/Transformação já agendam normalmente após D0 — não há bug. O único gap real é no **Essencial**:

- D0 é a única sessão do mês (correto pelo plano). Se ela é concluída, a próxima vem só no dia 1 do mês seguinte via `monthly-schedule-renewal`. **Manter essa regra.**
- O problema: quando o usuário Essencial **não responde ao convite D0** (ou recusa sem horário), nenhum cron lembra ele depois — `schedule-setup-reminder` exclui Essencial no filtro `.in('plan', ['direcao', 'transformacao'])`. Resultado: usuários ficam com `pending_first_session_invite=true` ou `needs_schedule_setup=true` parados por dias sem reativação.

Vou fazer **2 mudanças cirúrgicas**, sem mexer no fluxo pós-D0 dos outros planos.

---

## Mudanças

### 1. `schedule-setup-reminder/index.ts` — incluir Essencial

Trocar nos 2 blocos (primeiro lembrete 48–96h e lembrete urgente):
```
.in('plan', ['direcao', 'transformacao'])
```
por:
```
.in('plan', ['essencial', 'direcao', 'transformacao'])
```

Efeito: usuários Essencial com `needs_schedule_setup=true` (D0 recusada/não respondida) passam a receber os mesmos 2 toques que os outros planos. Como o plano só tem 1 sessão/mês, o bloco `CRIAR_AGENDA` do prompt da Aura (linha 5868 do `aura-agent`) já injeta o exemplo certo de 1 data via memória `setup-mensal-essential-aware`.

### 2. `session-reminder/index.ts` — cutoff de 14 dias

Antes de enviar lembrete T-24h ou T-5min de uma sessão `scheduled`, verificar `last_message_date`:

- Se `last_message_date < now() - 14 days`:
  - `UPDATE sessions SET status='cancelled'` para a sessão alvo
  - Limpar `pending_insight` relacionado, se houver
  - Pular envio do template
  - Log: `📅 [SESSION_CUTOFF_14D] user=<id> session=<id> last_msg=<date>`
- Caso contrário: comportamento atual (envia lembrete).

Substitui o cutoff antigo de 7 dias (que apenas silenciava o T-24h e nada fazia no T-5min).

### 3. Memória

Atualizar `mem://features/whatsapp/session-reminder-flow` adicionando a regra de 14 dias (cancela sessão + limpa insight). Atualizar a entrada `setup-mensal-essential-aware` no índice para refletir que `schedule-setup-reminder` agora cobre Essencial.

---

## Detalhes técnicos

- **Sem migrações**: colunas já existem (`profiles.last_message_date`, `sessions.status`, `pending_insight.session_id`).
- **Quiet hours**: cutoff roda antes do gate de envio; cancelamento ocorre 24/7, envio respeita 22h–08h normalmente.
- **`in_progress` não é afetado**: cutoff filtra só `status='scheduled'`.
- **Não toca em `pending_first_session_invite`**: o convite inicial D0 segue como está; o reminder cobre o caso pós-recusa onde `needs_schedule_setup=true`.

## Verificação

1. `SELECT count(*) FROM profiles WHERE plan='essencial' AND needs_schedule_setup=true AND status='active' AND schedule_reminder_first_sent_at IS NULL AND updated_at < now()-interval '48 hours';` → após próximo tick deve cair (lembretes enviados).
2. `SELECT count(*) FROM sessions s JOIN profiles p USING(user_id) WHERE s.status='scheduled' AND s.scheduled_at < now()+interval '48 hours' AND p.last_message_date < now()-interval '14 days';` → deve ir a 0 após o próximo tick do `session-reminder`.
3. Logs de edge function devem mostrar `📅 [SESSION_CUTOFF_14D]` para casos cancelados.

## Fora de escopo (confirmado)

- Não mexer no fluxo pós-D0 de Direção/Transformação (já funciona).
- Não forçar `needs_schedule_setup` extra após D0 do Essencial (D0 = sessão do mês, regra mantida).
- Não criar agendamento semanal para Essencial.
