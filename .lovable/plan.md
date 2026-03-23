

# Bug: `minimal_context` não é tratado no aura-agent

## Problema

O `process-webhook-message` envia `minimal_context: true` no 3º retry, mas o `aura-agent`:
1. **Não lê** esse campo do `req.json()` (linha 3390)
2. **Sempre carrega** 40 mensagens + 50 insights + 10 temas + 5 compromissos + 3 sessões + meditações

Resultado: o retry "minimal" é idêntico ao normal — mesma latência, mesmo risco de timeout.

## Plano

**Arquivo**: `supabase/functions/aura-agent/index.ts`

### 1. Extrair `minimal_context` do request body
Na linha 3390, adicionar `minimal_context` ao destructuring:
```typescript
const { message, user_id, phone, pending_content, pending_context, last_user_context, minimal_context } = await req.json();
```

### 2. Reduzir queries quando `minimal_context === true`
Na seção de carregamento paralelo (linhas 3881-3957), quando `minimal_context`:
- Mensagens: `limit(10)` em vez de `limit(40)`
- Insights críticos: `limit(5)` em vez de `limit(15)`
- Insights gerais: **pular** (não carregar)
- Sessões completadas: **pular**
- Temas: `limit(3)` em vez de `limit(10)`
- Compromissos: `limit(2)` em vez de `limit(5)`
- Meditações: **pular**
- Jornada: **pular**

### 3. Pular fase evaluator e pós-análise quando minimal
- Pular `evaluateTherapeuticPhase` (não precisa detectar estagnação no retry)
- Pular `postConversationAnalysis` via `waitUntil` (economia de tempo)
- Pular detecção de repetição (não há histórico suficiente para comparar)

### 4. Log para rastreabilidade
Adicionar log: `📉 minimal_context mode: reduced history and skipped analysis`

**Impacto**: O 3º retry terá ~70% menos dados para carregar e menos processamento, reduzindo drasticamente a chance de timeout. O modelo ainda recebe as últimas 10 mensagens + perfil + insights essenciais — suficiente para uma resposta coerente.

**Total**: ~20 linhas de condicionais, zero mudança na lógica principal.

