

## Problema identificado

O link de checkout está **desaparecendo** da mensagem da Aura para trials. Aqui está o que acontece:

1. Os nudges de trial instruem a LLM a incluir o URL hardcoded `https://olaaura.com.br/checkout`
2. Porém, o sistema prompt TAMBÉM ensina a Aura a usar tags `[UPGRADE:plano]` para gerar links
3. A LLM às vezes "traduz" o URL para `[UPGRADE:essencial]` em vez de enviar o link literal
4. O `processUpgradeTags` **remove** `[UPGRADE:essencial]` (linha 2529) porque "upgrade para essencial não faz sentido"
5. Resultado: a mensagem chega ao usuário **sem nenhum link**

Isso explica o "Tem que mandar certo" da Valdenice — a Aura prometeu um link mas ele foi removido no processamento.

## Solução

**Gerar o link curto ANTES de montar o prompt**, e injetá-lo diretamente no contexto do trial — eliminando a chance da LLM alterar o URL.

### Mudanças em `supabase/functions/aura-agent/index.ts`:

1. **Na seção de trial nudges (linhas ~3574-3605)**: Em vez de hardcodar `https://olaaura.com.br/checkout`, gerar um short link via `create-short-link` para a URL de checkout e injetar o short link no prompt. Isso garante que o link é um URL real e curto que não será confundido com uma tag.

2. **Criar função helper `generateTrialCheckoutLink`**: Chama `create-short-link` com a URL `https://olaaura.com.br/checkout` + phone do usuário. Retorna o short URL ou fallback para o URL original.

3. **Aplicar nos 4 pontos de nudge com link**:
   - Aha+4 (linha 3581)
   - Fallback msg 45 (linha 3596)
   - Fallback msg 48 (linha 3605)
   - Instruir explicitamente no prompt: "Use EXATAMENTE este link, não substitua por tags [UPGRADE:]"

4. **Mesma correção nos follow-ups hardcoded** em `execute-scheduled-tasks/index.ts` (linhas 204, 237, 259, 305) e `webhook-zapi/index.ts` (linhas 395-397, 505): Gerar short links dinâmicos para evitar URLs longos no WhatsApp.

### Mudança secundária: não remover `[UPGRADE:essencial]` silenciosamente

Na função `processUpgradeTags` (linha 2529-2531), em vez de simplesmente remover a tag, substituir pelo link de checkout genérico para que o usuário ainda receba um link funcional:

```typescript
if (plan === 'essencial') {
  // Trial users on essencial: generate checkout link instead of stripping
  const shortUrl = await createShortLink('https://olaaura.com.br/checkout', phone);
  processedContent = processedContent.replace(match, shortUrl || 'https://olaaura.com.br/checkout');
  continue;
}
```

### Resumo dos arquivos afetados:
1. **`aura-agent/index.ts`** — Helper para gerar short link de trial + injetar nos prompts de nudge + fix no `processUpgradeTags` para essencial
2. **`execute-scheduled-tasks/index.ts`** — Gerar short links nos follow-ups hardcoded
3. **`webhook-zapi/index.ts`** — Gerar short links nas mensagens de status (canceled, inactive, paused)

