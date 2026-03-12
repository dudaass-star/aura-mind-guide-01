

# Auditoria: Quiet Hours (8h-22h BRT) em todas as Edge Functions

## Resultado da Auditoria

| Function | Envia msgs? | Tem quiet hours? | Risco |
|---|---|---|---|
| `conversation-followup` | Sim | **Sim** (L339-349) | Seguro |
| `pattern-analysis` | Sim | **Sim** (L48-51, L196-201) | Seguro |
| `periodic-content` | Sim | **Nao** | **RISCO** |
| `session-reminder` | Sim | **Nao** | **RISCO** |
| `weekly-report` | Sim | **Nao** | **RISCO** |
| `scheduled-followup` | Sim | **Nao** | **RISCO** |
| `scheduled-checkin` | Sim | **Nao** | **RISCO** |
| `reactivation-check` | Sim | **Nao** | **RISCO** |
| `deliver-time-capsule` | Sim | **Nao** | **RISCO** |
| `send-meditation` | Sim (sob demanda) | N/A | Seguro (chamada pelo aura-agent) |
| `schedule-setup-reminder` | Sim | **Sim** (corrigido agora) | Seguro |
| `cleanup-inactive-users` | Nao (so deleta) | N/A | Seguro |

## Functions que precisam de correção (6 no total)

### 1. `periodic-content` - Conteudo de jornadas
- Roda via cron, envia manifestos
- Precisa de guardrail de quiet hours no inicio

### 2. `session-reminder` - Lembretes de sessao
- Roda a cada 5 min (`*/5 * * * *`)
- Envia lembretes 24h, 1h, 15min, inicio de sessao, post-sessao, sessao perdida
- **Caso especial**: lembretes de sessao sao time-sensitive. Se a sessao do usuario e as 8h, o lembrete de 1h precisa sair as 7h. Proposta: aplicar quiet hours apenas nos blocos de post-sessao e lembrete de 24h, mas permitir lembretes operacionais (1h, 15min, inicio) mesmo fora do horario

### 3. `weekly-report` - Relatorio semanal
- Roda domingos as 19h BRT (seguro pelo cron), mas nao tem guardrail no codigo
- Precisa de guardrail defensivo

### 4. `scheduled-followup` - Follow-up de compromissos
- Envia lembretes de compromissos pendentes
- Sem nenhum guardrail de horario

### 5. `scheduled-checkin` - Check-in diario
- Envia check-ins proativos
- Sem nenhum guardrail de horario

### 6. `reactivation-check` - Reativacao de inativos
- Envia msgs para usuarios inativos e sessoes perdidas
- Sem nenhum guardrail de horario

### 7. `deliver-time-capsule` - Capsulas do tempo
- Entrega capsulas agendadas pelo usuario
- Sem guardrail de horario

## Plano de implementacao

Adicionar o mesmo padrao de quiet hours usado em `conversation-followup` e `pattern-analysis` em todas as 7 functions acima:

```typescript
function getBrtHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

// No inicio do handler:
const brtHour = getBrtHour();
if (brtHour < 8 || brtHour >= 22) {
  console.log(`🌙 Quiet hours (${brtHour}h BRT) - skipping`);
  return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours' }));
}
```

**Excecao para `session-reminder`**: Lembretes de 1h, 15min e inicio de sessao continuam funcionando 24/7 (sao time-sensitive e vinculados a sessoes que o proprio usuario agendou). Apenas os blocos de lembrete de 24h, post-sessao e sessao abandonada recebem o guardrail.

**Excecao para `deliver-time-capsule`**: O usuario escolheu a data de entrega. Se caiu de madrugada, guardar e entregar as 8h BRT. Adicionar logica de "atrasar entrega para 8h se quiet hours".

## Arquivos a alterar
- `supabase/functions/periodic-content/index.ts`
- `supabase/functions/session-reminder/index.ts`
- `supabase/functions/weekly-report/index.ts`
- `supabase/functions/scheduled-followup/index.ts`
- `supabase/functions/scheduled-checkin/index.ts`
- `supabase/functions/reactivation-check/index.ts`
- `supabase/functions/deliver-time-capsule/index.ts`

