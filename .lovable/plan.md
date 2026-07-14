# Revisão do portal — o que está bom e o que ajustar

## O que está bom

- Header, tabs e footer seguem o mesmo grid (`max-w-2xl`), tipografia (Fraunces/Nunito) e cor de acento das outras abas — a nova aba **Memória** e o **Intimacy** não destoam.
- Ledger tem CRUD completo (corrigir / apagar / marcar / adicionar), com toasts e agrupamento por categoria.
- IntimacyLevel é discreto (barra de 3 traços + frase + tooltip), coerente com o contrato clínico — não vira "gamificação de app".

## O que precisa ajuste

### 1. Barra de abas está apertada (8 abas)

- "Sua jornada" + "O que a Aura sabe" são rótulos longos e empurram a barra pro scroll horizontal em mobile.
- Ajuste: encurtar rótulos → **"Jornada"** e **"Memória"** (ícones já dão o contexto).

### 2. Confirmação de apagar usa `confirm()` nativo

- Fora do padrão do resto do portal (que usa toasts e diálogos shadcn).
- Trocar por `AlertDialog` do shadcn com título "Apagar da memória da Aura?" e ação destrutiva.

### 3. Ordenação da lista pode esconder o que o usuário adicionou

- Query ordena por `importance desc, mentioned_count desc`. Itens adicionados pelo usuário entram com `importance = 9`, mas `mentioned_count = 1` — podem ficar depois de coisas antigas com muitas menções.
- Ajuste: dentro de cada categoria, subir sempre no topo os `category = 'user_added'` e depois aplicar o sort atual.

### 4. Categorias podem aparecer com rótulos genéricos

- `CATEGORY_LABELS` cobre 7 chaves em PT. Se o extractor gravar categoria em inglês (`people`, `facts`) cai no fallback "Outros".
- Adicionar mapeamento defensivo para `people/facts/identity/routine/preferences` → mesmos rótulos PT.

### 5. Empty state do Ledger e usuário novo

- Hoje mostra "A Aura ainda está te conhecendo" para qualquer lista vazia. Faltou o mesmo cuidado que fizemos em Jornada (distinguir usuário recém-criado).
- Ajuste leve: se `profile.created_at` < 7 dias, texto vira "Nos primeiros dias a Aura ainda está ouvindo. O caderno começa a preencher conforme vocês conversam."

### 6. IntimacyLevel — validar acesso no portal

- Faz `count` em `sessions` + `select` em `session_themes` + `count` em `user_memory_corrections` usando `supabasePortal`. Preciso confirmar que as três tabelas têm política de SELECT para o token do portal — se `session_themes` não tiver, o cálculo silenciosamente retorna 0 e o usuário fica travado em "Início" para sempre.
- Ação: query rápida no schema; se faltar policy, adicionar SELECT via `portal_token`.

### 7. Microcopy do Intimacy

- "A Aura te conhece a fundo — em várias camadas da sua vida." soa um pouco solene. Alternativa mais leve, mesma intenção: "A Aura já te conhece em várias camadas."
- Só cosmético — confirmar se quer trocar. NAO TROCAR

## Fora de escopo (não mexer agora)

- Estrutura das outras abas, cores/tokens globais, layout do header.

## Arquivos afetados

- `src/pages/UserPortal.tsx` (rótulos das tabs)
- `src/components/portal/MemoriaTab.tsx` (AlertDialog, ordenação, empty state contextual, categorias EN)
- `src/components/portal/IntimacyLevel.tsx` (microcopy, se aprovado)
- Migração SQL só se a checagem de RLS em `session_themes` mostrar policy faltando.