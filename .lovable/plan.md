## Contexto

40 usuários Direção/Transformação sem sessão futura:
- **1** com janela 24h aberta (ALAN BARROS) → texto livre direto
- **39** com janela fechada → template `cheking_7dias` (único proativo aprovado)

Perfis:
- **Perfil A (23):** nunca agendaram (`sessoes_total = 0`) — D0 nunca fechou
- **Perfil B (17):** já tiveram sessões (`sessoes_total > 0`) — ciclo mensal esgotou

## Estratégia de resgate

Usar `cheking_7dias` como **abridor de janela**. Quando o usuário responder, o webhook cai no `aura-agent` normalmente:
- **Perfil A:** se `pending_first_session_invite=true`, dispara o convite D0 binário (já existente). Se não, setamos a flag agora.
- **Perfil B:** Aura conduz para setup mensal pelo fluxo natural (já implementado).

Para garantir que a Aura puxe o tema "marcar sessão" assim que abrirem a janela, vamos **setar `pending_first_session_invite=true` nos 23 do Perfil A** antes do disparo, e gravar uma flag temporária em `profiles` (ex: `needs_schedule_setup=true`) para os 17 do Perfil B — assim o setup mensal já existente é acionado quando responderem.

## Plano de execução

### Passo 1 — CSV de auditoria

Exportar `/mnt/documents/resgate_sessoes_pendentes.csv` com os 40 usuários (nome, telefone, plano, perfil A/B, janela 24h, dias desde última msg).

### Passo 2 — Preparar flags no banco (1 migration)

- `UPDATE profiles SET pending_first_session_invite = true, first_session_invite_attempts = 0 WHERE user_id IN (...23 Perfil A...)`
- `UPDATE profiles SET needs_schedule_setup = true WHERE user_id IN (...17 Perfil B...)`

### Passo 3 — Resgatar o 1 com janela aberta (texto livre)

ALAN BARROS — Direção trial, msg hoje 15:30 BRT. Enviar texto livre direto convidando a marcar 1ª sessão, sem template.

### Passo 4 — Disparar `cheking_7dias` para os 39

Criar edge function pontual `rescue-sessions-blast` (one-shot):
- Busca a lista dos 39 user_ids (parametrizada via payload)
- Para cada um: chama `sendProactiveMessage(phone, '', 'checkin', userId)` → como janela fechada, vai por template `cheking_7dias`
- Respeita janela 08h-22h BRT (se estiver fora, retorna sem disparar)
- Delay 2s entre envios (rate limit)
- Loga cada envio em `failed_message_log` (success ou erro)
- Retorna sumário JSON {enviados, falhas, fora_janela}

Invocação manual via `curl_edge_functions` quando estivermos prontos.

### Passo 5 — Garantir que respostas caiam no fluxo certo

Já funciona pelo aura-agent + flags do Passo 2. Sem código novo aqui.

### Passo 6 — Monitorar 48h

Query de validação:
```sql
SELECT COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.user_id=p.user_id AND s.status='scheduled' AND s.scheduled_at > now())) AS resgatados
FROM profiles p WHERE p.user_id IN (...40...);
```

### Passo 7 (após resgate) — Causa raiz

- **Perfil B:** auditar `monthly-schedule-renewal` (função já existe) para entender por que não cobriu os 17. Provavelmente não está agendada no cron ou tem filtro errado.
- **Perfil A:** o plano `.lovable/plan.md` (race do limpador D0) cobre o bug que está gerando esses casos.

## Arquivos afetados

- `supabase/functions/rescue-sessions-blast/index.ts` (novo, ~100 linhas, one-shot)
- 1 migration para flags
- `/mnt/documents/resgate_sessoes_pendentes.csv` (artefato)

## Fora de escopo

- Criar template novo
- Refatorar `monthly-schedule-renewal` (auditoria sim, refactor não)
- Resgatar usuários Essencial (foco só nos pagos premium)

## Confirmação antes de executar

Disparo os 39 **todos hoje em janela 08h-22h BRT**, ou prefere lotes (ex: 10 mais engajados primeiro, validar resposta em 24h, depois resto)?
