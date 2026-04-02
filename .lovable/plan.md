

## Auditoria Completa: Mensagens Proativas — Problemas Encontrados

### Resumo

Analisei **todas as 18+ funções** que enviam mensagens proativas. A maioria está correta, mas encontrei **2 problemas críticos** e **1 menor**.

---

### Problema 1 (CRÍTICO): `stripe-webhook` usa `send-zapi-message` em vez de `sendProactive`

O `stripe-webhook/index.ts` faz **5 chamadas diretas** a `send-zapi-message`, que usa `sendMessage` (texto livre). Isso significa que essas mensagens **falham silenciosamente quando o usuário não está dentro da janela de 24h**, porque não usam templates.

**Mensagens afetadas:**
1. **Welcome após checkout.session.completed** (linha ~308) — `welcome`
2. **Welcome após invoice.payment_succeeded** (linha ~529) — `welcome`  
3. **Farewell após customer.subscription.deleted** (linha ~631) — mensagem de despedida
4. **Welcome back após reativação** (linha ~711) — `welcome`
5. **Dunning após invoice.payment_failed** (linha ~991) — `dunning`

**Correção:** Substituir as 5 chamadas `send-zapi-message` por `sendProactive()` direto, com as categorias de template corretas (`welcome`, `dunning`, etc.).

---

### Problema 2 (CRÍTICO): `reprocess-dunning` usa `send-zapi-message` em vez de `sendProactive`

O `reprocess-dunning/index.ts` (linha ~145) também chama `send-zapi-message` diretamente. Mesma consequência: falha fora da janela de 24h.

**Correção:** Substituir por `sendProactive(phone, dunningMessage, 'dunning', profile.user_id)`.

---

### Problema 3 (Menor): `recover-abandoned-checkout` não passa `userId`

O `recover-abandoned-checkout` chama `sendProactive(phone, message, 'checkout_recovery')` sem `userId`. Como checkouts abandonados são de usuários que ainda não estão na base, isso é **comportamento correto** — sempre vai para template, que é o esperado. Sem ação necessária.

---

### Funções Corretas (sem alteração necessária)

Todas as demais funções já usam `sendProactive` corretamente com `userId` e `templateCategory`:
- `scheduled-checkin` ✅
- `conversation-followup` ✅  
- `weekly-report` ✅
- `session-reminder` ✅
- `periodic-content` ✅ (com teaser)
- `send-meditation` ✅
- `deliver-time-capsule` ✅
- `reactivation-check` ✅
- `start-trial` ✅
- `instance-reconnect-notify` ✅
- `schedule-setup-reminder` ✅
- `monthly-schedule-renewal` ✅
- `admin-send-message` ✅
- `reactivation-blast` ✅

---

### Plano de Implementação

**Arquivo 1: `supabase/functions/stripe-webhook/index.ts`**
- Importar `sendProactive` de `whatsapp-provider.ts`
- Substituir as 5 chamadas `fetch(send-zapi-message)` por:
  - Welcome messages → `sendProactive(phone, msg, 'welcome', userId)`
  - Farewell → `sendProactive(phone, msg, 'checkin', userId)` (ou criar categoria dedicada se não houver)
  - Welcome back → `sendProactive(phone, msg, 'welcome', userId)`
  - Dunning → `sendProactive(phone, msg, 'dunning', userId)`

**Arquivo 2: `supabase/functions/reprocess-dunning/index.ts`**
- Importar `sendProactive` de `whatsapp-provider.ts`
- Substituir a chamada `fetch(send-zapi-message)` por `sendProactive(phone, msg, 'dunning', userId)`

**Deploy:** `stripe-webhook` + `reprocess-dunning`

### Detalhes Técnicos

- Cada substituição simplifica o código (remove ~10 linhas de fetch/headers/body/error handling por chamada)
- O `sendProactive` já faz: verificação de janela 24h → texto livre se aberta, template se fechada
- Nenhuma mudança de schema ou migration necessária

