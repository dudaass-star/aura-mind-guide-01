

## Plano Completo: Reativacao de sessoes perdidas + janela de 1 hora

### Resumo

Tres mudancas no `aura-agent`: (1) ampliar janela de deteccao de sessao agendada de 15 minutos para 1 hora, (2) buscar sessoes canceladas/no_show sem limite de tempo, e (3) tratar os 3 cenarios de resposta do usuario.

### Mudancas tecnicas

**Arquivo unico:** `supabase/functions/aura-agent/index.ts`

---

#### 1. Ampliar janela de sessao agendada de 15min para 1h (linhas 2192-2197)

Mudar de:
```text
fifteenMinAgo = now - 15 min
fifteenMinAhead = now + 15 min
```
Para:
```text
oneHourAgo = now - 60 min
oneHourAhead = now + 60 min
```

Isso permite que usuarios que chegam ate 1 hora atrasados ainda encontrem a sessao com status `scheduled`.

---

#### 2. Buscar sessao perdida (cancelled/no_show) sem limite de tempo (apos linha 2213)

Quando nao encontrar `pendingScheduledSession`, buscar a sessao mais recente com status `cancelled` ou `no_show` que nunca foi iniciada e cuja reativacao nao foi recusada:

```text
if (!pendingScheduledSession && profile?.user_id) {
  Buscar sessao mais recente com:
    - user_id = profile.user_id
    - status IN ('cancelled', 'no_show')
    - started_at IS NULL
    - session_summary IS NULL OR session_summary != 'reactivation_declined'
  Ordenar por scheduled_at DESC, limit 1
  Guardar em recentMissedSession
}
```

---

#### 3. Logica de reativacao quando usuario confirma (apos linha ~2404)

Se `recentMissedSession` existe e usuario confirma que quer fazer agora (`confirmsSessionStart`):
- Mudar status da sessao para `in_progress`
- Setar `started_at = now`
- Atualizar `current_session_id` no profile
- Incrementar `sessions_used_this_month`
- Seguir metodo completo das 4 fases

---

#### 4. Processar tag [SESSAO_PERDIDA_RECUSADA] (secao de processamento de tags, ~linha 3400+)

Nova tag para quando o usuario nao quer fazer a sessao agora nem reagendar:
- Atualizar `session_summary` da sessao para `"reactivation_declined"`
- Isso impede que a sessao seja oferecida novamente

---

#### 5. Injetar contexto no prompt (apos linha ~2714)

Quando existir `recentMissedSession` e nao houver sessao ativa nem pendente, adicionar ao prompt:

```text
SESSAO PERDIDA DETECTADA!
- O usuario tinha uma sessao agendada para [dia] as [hora] que nao aconteceu.
- Pergunte com carinho se ele quer:
  1. Fazer a sessao agora
  2. Reagendar para outra data (usar [REAGENDAR_SESSAO:YYYY-MM-DD HH:mm])
  3. Ou se prefere so conversar por hoje (usar [SESSAO_PERDIDA_RECUSADA])
- Ofereca UMA vez e respeite a decisao. NAO insista.
```

---

### Fluxo completo

```text
Usuario manda mensagem
  |
  +-- Buscar sessao scheduled (janela de 1 HORA) -> encontrou? Fluxo atual normal
  |
  +-- Nao encontrou? Buscar sessao cancelled/no_show mais recente (sem limite de tempo)
  |     |
  |     +-- Encontrou (e nao foi recusada antes)?
  |     |     |
  |     |     +-- AURA pergunta com carinho o que o usuario prefere
  |     |     |
  |     |     +-- "Quero fazer agora" -> Reativar sessao, iniciar metodo 4 fases
  |     |     +-- "Quero reagendar" -> [REAGENDAR_SESSAO:data hora]
  |     |     +-- "So quero conversar" -> [SESSAO_PERDIDA_RECUSADA] -> modo normal
  |     |           (sessao nao conta como usada, nao pergunta mais sobre ela)
  |     |
  |     +-- Nao encontrou (ou ja recusada) -> Modo normal
```

### O que NAO muda
- Logica do `reactivation-check` (continua marcando sessoes como no_show/cancelled)
- Logica do `session-reminder`
- Metodo das 4 fases (seguido normalmente apos reativacao)
- Tag [REAGENDAR_SESSAO] (ja existe)
- Nenhuma tabela ou migration necessaria (reutiliza campo `session_summary`)

