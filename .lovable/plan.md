

# Fix: Mensagens duplicadas que a Aura "vê" no contexto

## Diagnóstico

A correção anterior (mover persistência do user após lock + dedup por conteúdo) **está funcionando** — não há mensagens de usuário duplicadas desde a implantação. Porém:

1. **Mensagens de assistant ainda duplicam**: O `process-webhook-message` persiste cada bubble do assistant (linhas 814 e 835), mas não tem proteção contra duplicação. Se um worker adquire o lock via "stale lock recovery" (linha 352-356), ele pode gerar e salvar uma segunda resposta completa.

2. **Duplicatas antigas ainda existem no banco**: Mensagens duplicadas de antes da correção continuam na tabela `messages` e poluem o contexto das últimas 40 mensagens que a Aura carrega.

3. **`aura-agent` não desduplicada ao carregar histórico**: A query em `aura-agent` (linha 3314-3319) carrega as últimas 40 mensagens sem qualquer filtro de duplicatas. Se existem 2x a mesma mensagem, a Aura as vê como mensagens separadas.

## Correções (3 alterações)

### 1. Dedup no carregamento do histórico (`aura-agent/index.ts`)

Na função `sanitizeMessageHistory` (linha 2070), adicionar lógica para remover mensagens consecutivas com conteúdo idêntico e mesmo role. Isso protege contra duplicatas existentes E futuras.

### 2. Dedup de assistant messages (`process-webhook-message/index.ts`)

Antes de persistir cada bubble do assistant (linhas 814 e 835), verificar se já existe uma mensagem idêntica do assistant nos últimos 30s para o mesmo user.

### 3. Limpeza de duplicatas antigas (migration SQL)

Executar uma migration que remove mensagens duplicadas existentes, mantendo apenas a mais antiga de cada par.

## Arquivos editados
- `supabase/functions/aura-agent/index.ts` — dedup no carregamento do histórico
- `supabase/functions/process-webhook-message/index.ts` — dedup antes de persistir assistant messages
- Nova migration SQL — limpar duplicatas históricas

## Resultado esperado
- Aura nunca mais "vê" mensagens duplicadas no contexto
- Novas respostas do assistant não são salvas em duplicata
- Banco limpo de duplicatas passadas

