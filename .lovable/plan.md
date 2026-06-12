## Objetivo

Permitir que o `support-agent` proponha **múltiplas ações** numa minuta (ex: `cancel_subscription` + `refund_invoice` x N) e que o checkbox "Executar" do painel rode todas elas, em ordem, antes do envio do e-mail. Hoje só cabe 1 ação por minuta.

## Mudanças

### 1. Backend — `supabase/functions/support-agent/index.ts`
- Adicionar campo `suggested_actions` (array, 0–5 itens) no tool schema `submit_support_draft`, mantendo `suggested_action` (singular) por compatibilidade temporária.
- Atualizar SYSTEM_PROMPT: quando o draft promete cancelamento + reembolso(s) das faturas pagas recentes, emitir a lista completa em `suggested_actions` (a 1ª como "principal", as demais como follow-up). Manter `suggested_action` = primeira ação da lista pra retrocompat.
- Estender o hardening de injeção de IDs pra iterar sobre `suggested_actions` (preencher `subscription_id`, `invoice_id`, `asaas_*_id` por item, escolhendo invoices distintos quando houver múltiplos refund_invoice).
- Gravar `suggested_actions` em `support_ticket_drafts` (coluna nova, JSONB).

### 2. Migration
- `ALTER TABLE support_ticket_drafts ADD COLUMN suggested_actions JSONB`. Sem default; código lê `suggested_actions ?? [suggested_action]` durante a transição.

### 3. Painel — `src/pages/AdminSupport.tsx`
- Renderizar a lista de ações com um checkbox por item (default: todas marcadas se críticas). Mostrar `type`, `reason` e `params` por linha.
- `handleApproveSend` passa a iterar sobre as ações marcadas: executa todas as **críticas** antes do e-mail (gate: se qualquer uma falhar, aborta envio e mostra qual). Não-críticas rodam best-effort depois.
- Manter retrocompat: se a minuta só tem `suggested_action`, comportamento atual idêntico.

### 4. `support-execute-action` (sem mudança no contrato)
Continua aceitando 1 ação por chamada — o painel chama N vezes em sequência. Mantém os fallbacks de auto-resolve já implementados.

### 5. `support-send-reply` (sem mudança)
A defesa de 5min contra ação crítica falha continua válida — agora protege contra qualquer uma das múltiplas ações ter falhado.

## Fora do escopo
- Não muda o contrato de `support-execute-action` (1 ação por call).
- Não toca em recovery/dunning/e-mail transacional.
- Não muda nada da Aura (WhatsApp).

## Detalhes técnicos

```text
support_ticket_drafts
├── suggested_action  JSONB   (legado, = suggested_actions[0])
└── suggested_actions JSONB   (novo, array)
```

Fluxo do painel ao aprovar:

```text
1. Pega lista de ações marcadas (críticas primeiro)
2. Para cada crítica:
     invoke('support-execute-action', { action })
     se !ok → abort, mostra qual falhou
3. invoke('support-send-reply', ...)
4. Para cada não-crítica marcada:
     invoke('support-execute-action', { action })  best-effort
```

Validação após mudança: criar ticket de teste pedindo cancelamento + reembolso de 2 faturas pagas, checar que a minuta vem com 3 itens em `suggested_actions`, aprovar com todos marcados, conferir 3 linhas em `support_ticket_actions` com `success:true`.