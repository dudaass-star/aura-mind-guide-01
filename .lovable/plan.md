

## Plano: Re-atualizar secret + redeploy

### Situação
- O código do branch `google/*` (linha 240-276) **não loga o prefixo da chave** — o log mencionado na linha 129 é do `logTokenUsage`, não do `callAI`
- Precisamos adicionar 1 linha de log do prefixo + re-atualizar o secret + redeploy

### Passos

1. **Adicionar log do prefixo** no bloco `google/*` (após linha 240):
   ```typescript
   console.log('🔑 GEMINI_API_KEY prefix:', GEMINI_API_KEY.substring(0, 12) + '...');
   ```

2. **Re-atualizar o secret `GEMINI_API_KEY`** — pedir para colar a chave `...K8w` do AI Studio

3. **Redeploy do `aura-agent`** — para que a função leia o secret atualizado

4. **Validar nos logs**:
   - Prefixo mostra `AIza...` → chave correta
   - Sem 401 → endpoint aceitou
   - `cached_tokens > 0` a partir da 2ª mensagem → cache ativo

### Alteração técnica
- **Arquivo**: `supabase/functions/aura-agent/index.ts`
- **Mudança**: 1 linha adicionada após linha 240

