

# Plan: Auto-Silenciar Envios Proativos Após 7 Dias Sem Resposta

## Conceito

Se `last_message_date` do usuário for anterior a 7 dias, **todos os envios proativos são bloqueados**, exceto o check-in mensal (que já filtra por 7+ dias de inatividade). Quando o usuário responde, `last_message_date` é atualizado automaticamente pelo `aura-agent`, reativando tudo.

## O que já funciona (sem mudança)

- `aura-agent` já atualiza `last_message_date` a cada mensagem recebida
- `scheduled-checkin` já filtra por 7+ dias sem mensagem (é o único que deve funcionar durante o silêncio)
- `do_not_disturb_until` continua funcionando independentemente

## Funções que precisam do guard de silêncio

Adicionar no início do loop de cada usuário:

```typescript
// Auto-silence: skip if user hasn't messaged in 7+ days
const lastMsg = profile.last_message_date ? new Date(profile.last_message_date) : null;
if (lastMsg && (Date.now() - lastMsg.getTime()) > 7 * 24 * 60 * 60 * 1000) {
  console.log(`🔇 Auto-silenced: ${profile.name} (7+ days inactive)`);
  continue;
}
```

| Função | Onde adicionar |
|---|---|
| `periodic-content` | No loop de users, antes do DND check |
| `pattern-analysis` | No loop de users, antes do DND check |
| `conversation-followup` | Nos dois loops (followups pendentes + sessões ativas) |
| `scheduled-followup` | No loop de commitments |
| `weekly-report` | No loop de profiles |
| `session-reminder` | No loop de sessions |

## O que NÃO é silenciado

- `scheduled-checkin` — é justamente o mecanismo de recontato
- `deliver-time-capsule` — o usuário agendou explicitamente
- `execute-scheduled-tasks` — tarefas agendadas pelo próprio usuário
- `stripe-webhook` / `dunning` — billing é crítico
- `instance-reconnect-notify` — operacional

## Nenhuma migração necessária

Usa `last_message_date` que já existe na tabela `profiles`.

## Total: 6 arquivos editados

Cada edição é a adição de ~4 linhas de guard no loop existente. Sem novos crons, sem novas colunas.

