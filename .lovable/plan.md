

# Remover fallback do Anti-Echo Guard

Concordo — um fallback genérico como "Me conta mais sobre isso... 💜" pode parecer desconectado e quebrar a naturalidade da conversa.

## Abordagem

Em vez de substituir a resposta por um fallback fixo, o guard vai **re-chamar a AI** pedindo uma resposta nova e diferente. Assim o usuário sempre recebe uma resposta contextual e nunca um texto genérico.

## Mudança técnica

**Arquivo:** `supabase/functions/aura-agent/index.ts` (linhas 3791-3801)

Substituir o fallback fixo por uma segunda chamada à AI com instrução explícita de não repetir a mensagem do usuário:

```typescript
// ANTI-ECHO GUARD
if (normalizedResponse === normalizedUserMsg || 
    (normalizedUserMsg.length > 10 && normalizedResponse.startsWith(normalizedUserMsg))) {
  console.warn('🚫 ANTI-ECHO: resposta idêntica detectada, re-gerando...');
  
  // Adicionar instrução anti-eco e re-chamar a AI
  const retryMessages = [...messagesForAI];
  retryMessages.push({ role: 'assistant', content: assistantMessage });
  retryMessages.push({ role: 'user', content: 
    '[SISTEMA: Sua resposta anterior repetiu o que o usuário disse. Gere uma resposta COMPLETAMENTE DIFERENTE. Reaja com suas próprias palavras, faça uma pergunta ou traga uma observação nova.]' 
  });
  
  const retryResponse = await callAI(retryMessages, systemPrompt, activeModel);
  if (retryResponse) {
    assistantMessage = retryResponse;
  }
  // Se o retry também falhar, mantém a resposta original (melhor que fallback genérico)
}
```

Isso garante que:
1. O usuário nunca receba um texto genérico
2. A resposta seja sempre contextual
3. No pior caso (retry também eco), mantém a resposta original em vez de um fallback

