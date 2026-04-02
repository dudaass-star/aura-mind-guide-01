

## Diagnóstico: Mensagens Silenciosamente Perdidas

### O Problema

Existe uma vulnerabilidade real no sistema. Em **25 funções** que enviam mensagens, muitas **ignoram o resultado do envio**. Se o Twilio falhar (timeout, rate limit, erro de rede), a mensagem é salva no banco como "enviada" mas o cliente **nunca recebe**.

### Onde o risco é maior

**1. `process-webhook-message` (CRÍTICO)** — O fluxo principal de conversa.
- Linha 953: `await sendMessage(cleanPhone, responseText)` — resultado **ignorado**
- A mensagem é persistida no DB logo em seguida como se tivesse sido enviada
- Se o Twilio falhar, o cliente fica sem resposta e a Aura "acha" que respondeu
- Isso afeta **todas as respostas conversacionais** da Aura

**2. Outros pontos sem verificação de resultado:**
- Linhas 327, 488, 514, 531, 544, 560, 577, 607, 644, 663 — todas no `process-webhook-message`, nenhuma verifica `success`
- `session-reminder` linhas 604, 730 — enviam sem checar resultado

### Plano de Correção

**Arquivo: `supabase/functions/process-webhook-message/index.ts`**

1. **Verificar resultado do sendMessage em TODOS os pontos de envio** — se `success === false`, logar erro com detalhes e **não persistir a mensagem no DB** (ou marcar como falha)

2. **Adicionar retry para a resposta principal do agente** (linha 953) — essa é a mensagem mais crítica. Se falhar, aguardar 2s e tentar novamente uma vez

3. **Criar tabela `failed_message_log`** para registrar falhas de envio com: user_id, content, error, attempted_at, retry_count. Isso permite reprocessamento manual e visibilidade no admin

**Arquivo: `supabase/functions/session-reminder/index.ts`**

4. **Verificar resultado nos 2 pontos que ignoram** (linhas 604, 730)

**Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`**

5. **Adicionar retry automático no nível do provider** — se o Twilio retornar erro transitório (429, 500, 502, 503), aguardar 2s e tentar novamente uma vez. Isso protege TODAS as funções automaticamente

### Impacto

- Sem essa correção, qualquer instabilidade do Twilio (mesmo que dure 30 segundos) pode causar perda silenciosa de mensagens para todos os clientes que interagirem naquele intervalo
- A tabela de log permite monitorar a saúde do envio e criar alertas futuros
- O retry no provider é a proteção mais eficaz porque cobre os 25 arquivos de uma vez

### Escopo

- 3 arquivos modificados: `process-webhook-message/index.ts`, `session-reminder/index.ts`, `whatsapp-provider.ts`
- 1 migration: criar tabela `failed_message_log`
- Sem impacto em funcionalidade existente (apenas adiciona proteção)

