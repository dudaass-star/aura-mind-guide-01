# Filtro de Ordenação — Painel Gestão de Usuários

Adicionar um dropdown de ordenação na barra de filtros do `AdminUsers.tsx`, permitindo classificar os usuários por diferentes critérios.

## O que será feito

1. **Novo state `sortFilter`** do tipo union: `'newest' | 'oldest' | 'last_contact' | 'highest_rating' | 'lowest_rating'`.

2. **Novo `<Select>` de ordenação** na barra de filtros (lado direito dos filtros existentes), com as opções:
   - Mais novos (padrão)
   - Mais antigos
   - Último contato
   - Maior rating
   - Menor rating

3. **Ajuste em `fetchProfiles`:**
   - `newest` → `.order('created_at', { ascending: false })`
   - `oldest` → `.order('created_at', { ascending: true })`
   - `last_contact` → `.order('last_user_message_at', { ascending: false })` com `.not('last_user_message_at', 'is', null)` opcional para evitar nulos no topo
   - `highest_rating` / `lowest_rating` → fallback para ordenação client-side (os ratings são carregados em lote para apenas 20 user_ids da página; ordenar via Supabase exigiria JOIN que não existe na query atual). Portanto, carregar a página atual e reordenar `profiles` em memória pelo `ratings[uid].avg`.

4. **Efeito colateral:** Adicionar `sortFilter` ao `useEffect` que dispara `fetchProfiles`.

## Arquivo afetado
- `src/pages/AdminUsers.tsx`

## Fora de escopo
- Ordenação server-side por rating (requeria migração de view ou RPC; opta-se por client-side dado o pequeno page size de 20).
- Ordenação por D0 status ou plano.