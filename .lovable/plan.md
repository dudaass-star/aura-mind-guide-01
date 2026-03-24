

# Diagnóstico: Meditação não chega para o Jhonatan

## O que aconteceu

Na conversa de hoje (23:29 BRT), a Aura ofereceu uma meditação guiada ao Jhonatan (momento emocional intenso — separação do filho). Ele aceitou, ela disse "Tô te mandando agora", mas o áudio **nunca chegou**. Ela tentou 2 vezes e desistiu, fazendo um fallback para respiração guiada por texto (boa decisão).

## Causa raiz

No `aura-agent/index.ts` (linha 5857), a chamada ao `send-meditation` é **fire-and-forget**:

```text
fetch(`${supabaseUrl}/functions/v1/send-meditation`, { ... })
  .then(res => console.log(...))
  .catch(err => console.error(...));
```

O `fetch` não é `await`-ado nem envolto em `EdgeRuntime.waitUntil`. Quando a edge function do aura-agent termina de processar e retorna a resposta, o runtime mata o fetch pendente. O `send-meditation` nunca é executado de fato.

Evidência: a tabela `user_meditation_history` está **vazia** para o Jhonatan, e os logs do `send-meditation` não mostram nenhuma invocação.

## Correção

**Arquivo**: `supabase/functions/aura-agent/index.ts`

Substituir o fire-and-forget por `await` no fetch do `send-meditation`:

```typescript
// ANTES (fire-and-forget - QUEBRADO)
fetch(`${supabaseUrl}/functions/v1/send-meditation`, { ... })
  .then(...)
  .catch(...);

// DEPOIS (aguardar resposta)
try {
  const medRes = await fetch(`${supabaseUrl}/functions/v1/send-meditation`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ ... }),
  });
  console.log(`🧘 send-meditation response: ${medRes.status}`);
  if (!medRes.ok) {
    console.error(`🧘 send-meditation error: ${await medRes.text()}`);
  }
} catch (err) {
  console.error(`🧘 send-meditation error:`, err);
}
```

Isso garante que o `send-meditation` seja chamado e tenha tempo de executar antes do aura-agent encerrar.

## Impacto

- Corrige o envio de meditações para **todos os usuários**, não só o Jhonatan
- Sem efeito colateral na latência percebida pelo usuário (a mensagem de texto já foi enviada antes da tag de meditação ser processada)

