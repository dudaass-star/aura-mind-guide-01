
# Garantir Resposta da Aura — Implementado ✅

## Correções Aplicadas

### 1. Timeout + 3 Retries no aura-agent ✅
- `AbortController` com 50s de timeout em cada chamada
- 3 tentativas: normal → normal → minimal_context
- 2s de espera entre retries
- Se todas falharem: erro propagado para catch (sem fallback)

### 2. Guard contra mensagens vazias ✅
- Após o loop de envio, se `!sentAnyResponse && !wasInterrupted`: retry com `minimal_context: true`
- Envia pelo menos 1 mensagem do retry
- Se retry também vazio: loga CRITICAL, conversation-followup CRON cuida

### 3. Mensagem de contingência removida ✅
- Removido "Tive um probleminha técnico" do catch
- Sem mensagens genéricas — conversation-followup faz follow-up natural

### 4. Persistência pré-lock ✅
- Mensagem do usuário salva ANTES de abortar no debounce
- Worker vencedor acumula todas as mensagens via query de acumulação
- Zero mensagens perdidas em cenário de concorrência

### 5. `minimal_context` tratado no aura-agent ✅
- Campo extraído do request body
- Queries reduzidas: 10 msgs, 5 insights críticos, 3 temas, 2 compromissos
- Skip: insights gerais, sessões completadas, meditações, jornada
- Log de rastreabilidade adicionado
