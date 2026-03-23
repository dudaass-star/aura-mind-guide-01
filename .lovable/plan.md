

# Fix: Mensagens truncadas na tela de admin

## Problema

A query de conversas no `admin-messages` tem `.limit(500)`. A Juliane tem 324 msgs só neste mês — o total histórico certamente ultrapassa 500, então as mensagens mais recentes ficam cortadas.

## Solução

Duas mudanças complementares:

### 1. Carregar apenas mensagens recentes + paginação para trás

Em vez de tentar carregar TODAS as mensagens (que vai piorar com o tempo), carregar as **últimas 200** por padrão e adicionar um botão "Carregar anteriores" no topo.

**Arquivo**: `supabase/functions/admin-messages/index.ts`
- Aceitar parâmetros `before` (timestamp) e `limit` (default 200)
- Query: `.lt('created_at', before)` quando fornecido, `.order('created_at', { ascending: false }).limit(200)` e reverter a ordem no retorno
- Retornar flag `has_more` para o frontend saber se há mais mensagens

**Arquivo**: `src/pages/AdminMessages.tsx`
- Adicionar botão "Carregar anteriores" no topo da lista de mensagens
- Ao clicar, fazer fetch com `before=` timestamp da mensagem mais antiga atual
- Preservar posição de scroll ao inserir mensagens anteriores

### 2. Detalhes técnicos

- A query inicial carrega as 200 mensagens mais recentes (suficiente para contexto imediato)
- Cada clique em "Carregar anteriores" busca mais 200
- Sem limite máximo — o admin pode navegar todo o histórico

