

# Diagnóstico: Aura parou de responder o Emerson Madruga

## O que foi encontrado

### Dados confirmados
- **5 mensagens** do Emerson após 16:24 (a última resposta da Aura): 16:46, 16:48, 16:49, 17:02, 17:03
- Todas registradas no `zapi_message_dedup` (webhook funcionou)
- Todas salvas na tabela `messages` como `role: 'user'` (process-webhook-message rodou)
- `conversation_followups` atualizado com `last_user_message_at: 17:03` (processamento chegou na linha ~400)
- **Zero respostas `role: 'assistant'`** desde 16:24
- Logs do edge function já rotacionaram (mensagens de 2h+ atrás)

### Problema crítico descoberto
A tabela `aura_response_state` tem **0 linhas** — para TODOS os usuários, não só o Emerson. Isso significa que o sistema de lock/interrupção está completamente inoperante. O upsert na linha 335 provavelmente está falhando silenciosamente (a tabela tem FK para `auth.users` com `ON DELETE CASCADE`).

Apesar disso, a Marcia recebeu respostas normalmente minutos atrás — o que indica que o código continua funcionando sem o lock (ele trata erros silenciosamente e prossegue).

### Hipótese mais provável para o Emerson
Como os logs já rotacionaram, não há como confirmar 100%, mas as evidências apontam para:
1. A mensagem de 16:46 pode ter sido um **áudio** (ele depois diz "Quero q vc escute o áudio"), onde a transcrição falhou e o `messageText` ficou vazio — saindo pelo early return da linha 408 (áudio sem transcrição) 
2. As mensagens seguintes (".", texto, ".", "Quero q vc escute o áudio") podem ter caído no **debounce** entre si
3. A última mensagem (17:03) deveria ter passado, mas pode ter encontrado o lock stale de um processamento anterior que não limpou corretamente (já que `aura_response_state` não persiste)

## Correção proposta

### 1. Fix `aura_response_state` — remover FK desnecessária
- A FK para `auth.users` não é necessária — o `user_id` já vem validado via `profiles`
- Remover a constraint via migration para que o upsert funcione corretamente
- Alternativamente, popular a tabela com todos os user_ids existentes

### 2. Adicionar logging no debounce e lock
- Logar o resultado do upsert/lock para detectar falhas silenciosas
- Logar quando o early return de áudio é acionado

### 3. Reprocessar mensagens do Emerson
- Verificar se as mensagens pendentes dele serão processadas na próxima interação (o sistema de acumulação deveria agrupar tudo)
- Ou enviar manualmente uma trigger para reprocessar

### Arquivos afetados
- `supabase/functions/process-webhook-message/index.ts` — adicionar logging
- Migration SQL — remover FK de `aura_response_state` ou corrigir constraint

