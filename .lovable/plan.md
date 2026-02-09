
## Corrigir AURA insistindo com Clara (e outros usuarios) apos conversa encerrada

### Problema Identificado

A AURA mandou **5 mensagens de follow-up** para Clara em ~50 minutos, mesmo depois de Clara dizer que estava trabalhando e a AURA responder com `[CONVERSA_CONCLUIDA]`.

A causa raiz sao **2 bugs** no sistema de follow-up:

### Bug 1: Fallback anula o encerramento da conversa (CRITICO)

Quando a AURA marca `[CONVERSA_CONCLUIDA]`, o webhook corretamente seta `last_user_message_at = null` na tabela `conversation_followups` para desativar follow-ups.

Porem, na funcao `conversation-followup` (linhas 395-399), existe um **fallback** que diz: "se `last_user_message_at` for null, use o timestamp da ultima mensagem do usuario no banco". Isso **reativa** os follow-ups que deveriam estar desativados.

### Bug 2: Contador reseta a cada interacao

Cada vez que Clara responde (ex: "eu estou trabalhando!!"), o webhook reseta `followup_count: 0`. Entao o limite de `maxFollowups = 2` nunca e atingido porque o contador zera a cada resposta da usuario.

### Solucao

#### 1. Remover o fallback que reativa follow-ups desativados
Na funcao `conversation-followup`, quando `last_user_message_at` e null, isso significa que a conversa foi **intencionalmente encerrada**. O sistema deve pular esse usuario em vez de buscar um fallback.

#### 2. Nao resetar followup_count quando conversa esta concluida
No webhook, quando `[CONVERSA_CONCLUIDA]` e detectado, setar `followup_count` para o valor maximo (ou um valor alto) para garantir que nenhum follow-up seja enviado ate a proxima conversa real.

#### 3. Respeitar "do_not_disturb" ao detectar pedidos de pausa
Quando o usuario disser explicitamente que esta ocupado (e a AURA reconhecer com `[CONVERSA_CONCLUIDA]`), o sistema ja seta `do_not_disturb_until`. Mas isso so foi implementado na resposta da AURA e nao no webhook - precisa ser garantido.

### Detalhes Tecnicos

**Arquivo: `supabase/functions/conversation-followup/index.ts`**
- Linhas 395-404: Remover o bloco de fallback. Se `last_user_message_at` e null, fazer `continue` (pular o usuario)

**Arquivo: `supabase/functions/webhook-zapi/index.ts`**
- Linhas 583-595: Quando `conversationStatus === 'complete'`, setar `last_user_message_at: null` E `followup_count` para um valor que garanta bloqueio (ex: 99), alem de limpar o `conversation_context`

**Re-deploy:** Ambas as functions `conversation-followup` e `webhook-zapi` precisam ser re-deployed apos as correcoes.
