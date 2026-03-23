

# Diagnóstico: AURA não responde — Análise completa

## O que encontrei nos dados

### Evidências concretas
1. **Ana Livia** (11:31 UTC): Mensagem "Oi" registrada na dedup e na tabela messages. Lock adquirido (`response_started_at: 11:31:13`) e liberado (`is_responding: false`). **Nenhuma mensagem assistant salva após.**
2. **Juliane** (12:54 UTC): Mensagem "Vc cuida de mim" registrada. Lock adquirido (`response_started_at: 12:54:38`) e liberado. **Nenhuma mensagem assistant salva após.**
3. **Logs**: Os logs de `process-webhook-message` e `aura-agent` para o horário das mensagens (~11:31 e ~12:54) **não estão mais disponíveis** (rotação de logs). O único log visível é um boot de teste às 13:22 com "Unauthorized".
4. **Modelo configurado**: `google/gemini-2.5-pro` — modelo padrão, sem erro de configuração.

### Cenário mais provável
O `aura-agent` está falhando em todas as 3 tentativas (timeout de 50s cada = até 150s total). Quando isso acontece:
- L748-750: `throw lastError` é executado
- L992-1003: O `catch` externo é atingido
- **Bug de scoping**: `supabase` e `profile` são `const` declarados dentro do `try` (L213, L257), mas referenciados no `catch` (L997-999)
- Em JavaScript, `const` dentro de um bloco `try` **NÃO é acessível** no `catch` correspondente
- Isso causa um `ReferenceError` **silencioso** — o lock deveria ser liberado pelo finally interno (L970-981), mas o erro real nunca é logado

### O que NÃO é a causa
- O bug de scoping **não impede** a liberação do lock (o `finally` interno em L970 já cuida disso)
- O bug **impede** a visibilidade do erro — sem logs úteis, não sabemos se é timeout do AI gateway, 429, 402, ou erro de modelo

## Plano de correção

### 1. Fix do scoping no catch externo (~10 linhas)
**Arquivo**: `supabase/functions/process-webhook-message/index.ts`

Mover `supabase` e `profile` para fora do `try`, trocando `const` por `let`:

```typescript
// L198 (antes do try)
let supabase: any = null;
let profile: any = null;

// L213: trocar 'const supabase' → 'supabase'
// L257: trocar 'const profile' → 'profile'
```

E no catch (L996-1003), adicionar guard:

```typescript
if (supabase && profile?.user_id) {
  // release lock
}
```

### 2. Logging detalhado no catch externo
Adicionar log com detalhes do erro para que da próxima vez que o agent falhe, possamos ver a causa exata:

```typescript
console.error('❌ Worker processing error:', {
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : 'unknown',
  phone: contingencyPhone,
});
```

### 3. Investigar causa raiz do timeout do agent
Após o deploy do fix de logging, a próxima falha revelará se é:
- Timeout do AI gateway (Lovable AI)
- Rate limit (429) ou créditos (402)
- Bug introduzido na última edição do `aura-agent` (a mudança do bloco USUÁRIO NOVO)

**Impacto**: ~15 linhas alteradas. Fix crítico para diagnóstico — sem ele, ficamos às cegas quando o agent falha.

