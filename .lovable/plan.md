

# Melhorias Finais do Portal Premium

## Problemas encontrados

### Bug crítico: Link "Voltar ao Meu Espaço" nunca aparece
O JornadasTab abre episódios com `?u=userId`, mas o Episode.tsx verifica `?t=portalToken` para mostrar o botão voltar. Como o token nunca é passado, o link de retorno **nunca é exibido**.

### Inconsistências visuais
- Episode.tsx usa emojis 💜 no footer e nas mensagens de conclusão
- Loading do Episode usa texto simples em vez de skeleton
- Tabs no mobile mostram labels abreviados ("Jorn.") que podem confundir

---

## Plano de correções

### 1. Corrigir link de retorno no Episode
- JornadasTab: passar o `portalToken` na URL do episódio (precisa receber via props ou searchParams)
- Ou: Episode.tsx aceitar `?u=` como fallback para mostrar botão voltar genérico com `window.history.back()`

### 2. Remover emojis restantes no Episode
- Substituir 💜 no footer por `<Heart>` Lucide com cor accent
- Remover emojis das mensagens de conclusão de jornada (linhas 206, 275)

### 3. Skeleton no Episode loading
- Substituir "Carregando..." por skeleton com header + barra de progresso + blocos de texto

### 4. Melhorar tabs mobile
- Mostrar sempre o label completo em todas as telas (remover shortLabel)
- Reduzir padding e font-size no mobile para caber tudo

---

## Arquivos modificados
- `src/pages/Episode.tsx` — emojis, skeleton, back link
- `src/pages/UserPortal.tsx` — tabs sempre com label completo
- `src/components/portal/JornadasTab.tsx` — passar token na URL do episódio

Total: 3 arquivos, sem mudanças no banco.

