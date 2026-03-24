

# Validação: Correção de mensagem duplicada no contexto da Aura

## Diagnóstico confirmado

O bug é real e a causa raiz está validada:

### Fluxo atual (com duplicação)

```text
process-webhook-message (linha 442):
  → salva "Oi tudo bem?" na tabela messages

aura-agent (linha 4003):
  → carrega últimas 40 mensagens do banco
  → inclui "Oi tudo bem?" (já salva)

sanitizeMessageHistory (linha 2819):
  → adiciona timestamp: "[24/03/2026 19:15] Oi tudo bem?"

aura-agent (linha 4796):
  → adiciona NOVAMENTE: "Oi tudo bem?" (sem timestamp)

apiMessages final:
  [system] instruções
  [system] contexto dinâmico
  ...histórico (inclui "[24/03/2026 19:15] Oi tudo bem?")
  [user] "Oi tudo bem?"   ← DUPLICATA
```

O dedup do `sanitizeMessageHistory` (linha 2823) não pega porque:
1. Ele roda **antes** da montagem final do `apiMessages`
2. O timestamp `[DD/MM/YYYY HH:MM]` torna as strings diferentes

O modelo recebe a mesma mensagem duas vezes e responde "você repetiu a pergunta".

## Correção proposta (validada)

**Arquivo**: `supabase/functions/aura-agent/index.ts` (linha ~4791)

Antes de montar `apiMessages`, remover a última mensagem do `messageHistory` se ela for do usuário e tiver o mesmo conteúdo (ignorando o prefixo de timestamp):

```typescript
// Deduplicate: remove last history entry if it's the same user message
const dedupedHistory = [...messageHistory];
if (dedupedHistory.length > 0) {
  const last = dedupedHistory[dedupedHistory.length - 1];
  if (last.role === 'user') {
    // Strip timestamp prefix [DD/MM/YYYY HH:MM] for comparison
    const cleanContent = last.content.replace(/^\[\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}\]\s*/, '');
    if (cleanContent === message) {
      dedupedHistory.pop();
    }
  }
}

const apiMessages = [
  { role: "system", content: AURA_STATIC_INSTRUCTIONS },
  { role: "system", content: dynamicContext },
  ...dedupedHistory,
  { role: "user", content: message }
];
```

### Por que não simplesmente remover a linha 4796?

Porque a mensagem explícita na linha 4796 garante que o texto chega **sem timestamp** e **sem sanitização**, exatamente como o usuário digitou. Remover a duplicata do histórico (que tem timestamp) é mais seguro.

### Risco
Zero. A mensagem do usuário continua presente uma vez no contexto. Nenhuma outra funcionalidade é afetada.

