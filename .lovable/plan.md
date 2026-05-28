
## Problema

No ticket de cancelamento do Samuel, a UI mostra o rascunho gerado em 27/05 21:10 (resposta da Aura pedindo confirmação de e-mail), mesmo depois de o cliente ter respondido em 28/05 12:32 com o WhatsApp + motivo do cancelamento. Ou seja, quando chega uma nova mensagem em um ticket que já tinha um rascunho atual, o `support-agent` não rodou (ou falhou silenciosamente) e o admin acabou vendo o rascunho antigo, desalinhado com a última fala do cliente.

## Diagnóstico

Fluxo atual:

1. `support-imap-poll` salva o inbound e dispara `supabase.functions.invoke("support-agent", { ticket_id })` em **fire-and-forget** (só loga erro, não persiste, não reenvia).
2. `support-agent` marca drafts anteriores como `is_current=false` e cria um novo. Se ele cair (timeout do Stripe/Asaas, erro do gateway, etc.), o ticket fica sem rascunho atual e o antigo continua aparecendo.
3. `AdminSupport.loadTicketDetail` apenas lê `is_current=true` — não compara timestamps com o último inbound.

Resultado: qualquer falha intermitente no agente deixa o admin lendo um rascunho velho sem saber.

## Mudanças

### 1. `supabase/functions/support-imap-poll/index.ts` — invocação robusta do agente

- Trocar o `invoke(...).catch(...)` por uma chamada `await` com `try/catch` dedicado por mensagem (já estamos dentro de `for (uid of uids)` com try/catch próprio).
- Se a invocação falhar OU retornar `error`, marcar o ticket como precisando de regeneração:
  ```ts
  await supabase.from("support_tickets").update({
    needs_draft_regen: true,
    last_inbound_at: nowIso, // já é setado antes
  }).eq("id", ticketId);
  ```
- Em caso de sucesso, garantir `needs_draft_regen = false`.

### 2. `supabase/functions/support-agent/index.ts` — limpar flag ao terminar

- No final do handler bem-sucedido, setar `needs_draft_regen = false` no `support_tickets.update(...)` já existente (linhas 447–451). Não precisa de nova query.

### 3. Migration — coluna `needs_draft_regen`

- `ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS needs_draft_regen boolean NOT NULL DEFAULT false;`
- Sem novas policies/grants (a tabela já é admin-only).

### 4. `src/pages/AdminSupport.tsx` — auto-regenerar quando o rascunho está defasado

Em `loadTicketDetail`, depois de carregar `messages` e `draft`:

- Calcular `latestInboundAt = max(messages.where(direction='inbound').created_at)`.
- Se `!draft` OU `draft.generated_at < latestInboundAt` OU `ticket.needs_draft_regen === true`:
  - Mostrar estado “Regenerando rascunho com a última mensagem do cliente…” no painel direito.
  - `await supabase.functions.invoke('support-agent', { body: { ticket_id: ticket.id } })`.
  - Recarregar `support_ticket_drafts` (current) e renderizar.
- Reaproveita o `setRegenerating(true)` já existente.

Isso resolve o sintoma imediato sem depender 100% do imap-poll, e funciona mesmo para tickets antigos com flag setada.

### 5. Realtime — re-render quando chega novo inbound no ticket aberto

Adicionar um segundo canal em `AdminSupport`:

```ts
supabase.channel(`ticket-msgs-${selectedTicket.id}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${selectedTicket.id}` }, (payload) => {
    if (payload.new.direction === 'inbound') loadTicketDetail(selectedTicket);
  })
  .subscribe();
```

Com a lógica do passo 4, ao chegar um novo inbound enquanto o admin está com o ticket aberto, a UI regenera sozinha.

### 6. Indicador visual leve

No header do rascunho (`Rascunho · google/gemini-2.5-pro · Gerado DD/MM às HH:mm`), quando `draft.generated_at < latestInboundAt`, exibir badge âmbar "Desatualizado — regenerando…" enquanto a chamada acontece, e some quando o novo draft chega.

## Fora de escopo

- Não mexer no `support-auto-respond` nem na lógica de elegibilidade.
- Não mudar prompt do `support-agent` nem regras de sigilo/cancelamento.
- Sem alteração em UI de outros tickets além do painel de detalhe.

## Validação

1. Abrir o ticket do Samuel: a UI deve detectar `draft.generated_at < latestInboundAt`, regenerar e exibir um rascunho que responde à mensagem 28/05 12:32 (WhatsApp 22 98111-6394 + motivo "vou fazer acompanhamento presencial"), seguindo o protocolo de retenção de cancelamento já configurado.
2. Forçar uma falha temporária no `support-agent` (ex: derrubar gateway) e enviar inbound novo: ticket deve ficar com `needs_draft_regen=true`; ao abrir o ticket, auto-regen dispara e zera a flag.
3. Manter o ticket aberto enquanto chega outro inbound (simulado por `support-imap-poll` ou insert manual): rascunho deve regenerar sozinho via realtime.
