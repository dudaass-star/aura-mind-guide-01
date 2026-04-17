

## Diagnóstico — Por que o link da Jornada não foi entregue após "Acessar"

### Linha do tempo do Eduardo (caso real, hoje):
- **12:00:35** — `periodic-content` salvou `pending_insight = [CONTENT]...EP 2/8 ENTENDER...` e enviou o template `jornada_disponivel` (janela de 24h estava fechada — última mensagem dele foi 02/04)
- **12:22:10** — Eduardo clicou no botão **Acessar** (chegou como mensagem de texto "Acessar")
- **12:40:06** — Aura respondeu **"Oi! E aí, o plano com a sua parceira rolou? 🤩"** — uma **mensagem do `scheduled-checkin`**, completamente desconectada
- O `pending_insight = [CONTENT]...` ficou no banco e nunca foi entregue

### Causa raiz

Quando o Eduardo clicou em "Acessar", o `process-webhook-message` **acionou o lock atômico** (`is_responding = true`). Porém, **o `aura-agent` nunca foi invocado** — não há log de chamada para esse user. O fluxo travou antes de chegar no bloco `if (profile?.pending_insight)` (linha 4615 do `aura-agent`), que é onde o `[CONTENT]` seria entregue.

Isso explica os **2 problemas combinados**:

1. **Pending insight não entregue** — algo no `process-webhook-message` interceptou "Acessar" e retornou cedo (provável: timeout do worker, lock travado, ou processo crashou silenciosamente)
2. **Check-in disparou em cima** — 18 minutos depois, o `scheduled-checkin` enviou seu próprio template porque `last_checkin_sent_at` estava velho. Como ele não checa se há `pending_insight` ativo, sobrescreveu o contexto

### O que vou corrigir

**Fix 1 — Garantir entrega de pending_insight (crítico)**
No `aura-agent`, quando há `pending_insight` com marcador `[CONTENT]`, `[WEEKLY_REPORT]` ou `[WELCOME]`, e a mensagem do usuário é apenas o clique do botão (texto curto tipo "Acessar", "Começar", "Ver meu resumo"), **enviar o conteúdo direto como mensagem livre**, sem passar pelo LLM. Isso elimina a chance do Gemini ignorar a instrução, atrasar, ou ser bloqueado por outro fluxo.

Determinístico: `if pendingInsight startsWith '[CONTENT]' && userMessage matches /acessar|ver|abrir/i → sendMessage(content); clear pending; return`.

**Fix 2 — Proteger contra check-in sobrescrevendo conteúdo pendente**
No `scheduled-checkin/index.ts`, adicionar guard: **pular usuário se `pending_insight` está preenchido** (ainda não foi entregue) ou se foi enviado conteúdo nas últimas 6h (`last_content_sent_at`).

**Fix 3 — Reduzir falha silenciosa no worker**
No `process-webhook-message`, adicionar log explícito antes de invocar o `aura-agent` e capturar erros do `invoke()` para log estruturado em `failed_message_log`. Isso vai expor a próxima falha imediatamente.

**Fix 4 — Recuperar Eduardo manualmente**
Disparar agora a entrega do `[CONTENT]` que ficou preso no `pending_insight` dele (e dos outros 3 usuários: Clara, Nilda, Daniela, Letícia) com mensagem livre direta — janela de 24h dele agora está aberta porque ele mandou "Acessar".

### Arquivos a editar
- `supabase/functions/aura-agent/index.ts` — entrega determinística no clique do botão
- `supabase/functions/scheduled-checkin/index.ts` — guard `pending_insight`
- `supabase/functions/process-webhook-message/index.ts` — log de invocação + captura de erro
- Edge call manual: entregar `pending_insight` dos 4 usuários afetados

### Resultado esperado
Toda mensagem proativa via template (`jornada_disponivel`, `aura_weekly_report_v2`, qualquer outra Quick Reply) terá o conteúdo rico entregue de forma garantida assim que o usuário clica no botão — sem depender do LLM cooperar.

