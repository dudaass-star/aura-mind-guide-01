## Problema

No painel `/admin/mensagens?tab=recuperacao` (componente `RecoveryInbox`), conversas que receberam template/mensagem outbound mas o usuário ainda não respondeu parecem não aparecer. Na verdade aparecem, mas ficam no fim da lista porque a ordenação considera apenas `last_inbound_at`. Quando um novo template é enviado, a conversa não sobe — o que dá sensação de "sumiço".

Os dados estão íntegros: 49 conversas em `recovery_conversations` (42 sem inbound, 7 com), todas registradas corretamente pela função de envio.

## Mudança

Ajustar apenas o componente `src/components/admin/RecoveryInbox.tsx`:

1. **Ordenação por última atividade (inbound OU outbound)**
   - Substituir `.order('last_inbound_at', { ascending: false, nullsFirst: false })` por ordenação combinada: ordenar localmente após o fetch usando `GREATEST(last_inbound_at, last_outbound_at)`.
   - Buscar todas as 200 conversas e ordenar no client por `Math.max(last_inbound_at, last_outbound_at)`.

2. **Timestamp exibido no item da lista**
   - Hoje mostra `formatDistanceToNow(last_inbound_at)` só quando há inbound.
   - Passar a mostrar sempre o timestamp do evento mais recente (inbound ou outbound), com um pequeno indicador textual quando for outbound — ex: prefixo "enviado " para outbound e "respondeu " para inbound (em pt-BR, usando `date-fns/locale/ptBR`).

3. **Realtime também para outbound**
   - O canal `recovery_conversations_admin` já escuta `*` em `recovery_conversations`, então um upsert de outbound já dispara `fetchList`. Verificar que isso é suficiente (é — a função de envio faz upsert atualizando `last_outbound_at`).

4. **Sem mudanças em**: badge "novo" (continua só para inbound não lido — semântica correta), envio de resposta, layout, RLS, edge functions ou schema.

## Detalhes técnicos

Arquivo único: `src/components/admin/RecoveryInbox.tsx`.

```ts
// fetchList: remover .order, manter limit 200
const { data } = await supabase
  .from('recovery_conversations')
  .select('*')
  .limit(200);

// Ordenar localmente:
const sorted = (data || []).sort((a, b) => {
  const ta = Math.max(
    a.last_inbound_at ? new Date(a.last_inbound_at).getTime() : 0,
    a.last_outbound_at ? new Date(a.last_outbound_at).getTime() : 0,
  );
  const tb = Math.max(
    b.last_inbound_at ? new Date(b.last_inbound_at).getTime() : 0,
    b.last_outbound_at ? new Date(b.last_outbound_at).getTime() : 0,
  );
  return tb - ta;
});
setConversations(sorted);
```

No render do item da lista, derivar `lastActivityAt` e `lastDirection` (in/out) e exibir algo como:

```
respondeu há 2 horas      ← se inbound mais recente
enviado há 1 dia          ← se outbound mais recente
```

## Resultado esperado

- Todas as conversas que receberam mensagens (com ou sem resposta) aparecem listadas.
- Lista ordenada por última atividade real (envio do template ou resposta), então novos envios sobem ao topo.
- Conversas sem resposta ficam visíveis e identificáveis pelo prefixo "enviado".
