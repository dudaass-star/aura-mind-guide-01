## Auditoria visual v2 — portal do Eduardo após as últimas mudanças

Objetivo: entrar logado como Eduardo (`duda.ass@gmail.com`), navegar as 6 abas e avaliar como ficou o portal depois de:
- Consolidação 8 → 6 tabs
- Reformulação de **Percurso** em capítulos mensais (síntese + citação + chips + acordeão)
- Reformulação de **Memória** em caderno navegável (busca + acordeões por categoria + paginação)
- `AcoesRapidasBar` com "Reagendar" 7/14/30 dias
- Empty state real da Hoje / fallback de Sobre você
- Correções P1 anteriores (sanitização `[CONTENT]`, typo "sessãoões", dedup Memória, IntimacyLevel)

### Passos

1. **Recriar edge function temporária** `dev-portal-magic-link` (Service Role gera magic link para o email do Eduardo com `redirectTo=/meu-espaco`).
2. **Deploy** da função e chamada única para gerar o link.
3. **Playwright headless (desktop 1280×1800 e mobile 390×844)** consumindo o magic link e capturando screenshots de cada aba:
   - Hoje
   - Sessões
   - Percurso (novo formato de capítulos)
   - Memória (novo caderno com busca/acordeões)
   - Sobre você
   - Meditações
   Em cada aba: screenshot no estado inicial + 1 interação chave (expandir um capítulo, abrir uma categoria da Memória, abrir popover de Reagendar).
4. **Coleta de console + network errors** durante a navegação.
5. **Análise** comparando com os bugs/UX findings da rodada anterior:
   - Bugs P1 realmente sumiram? (`[CONTENT]`, typo, dedup, IntimacyLevel recalibrado)
   - Percurso ficou navegável e narrativo (não mais parede de lista)?
   - Memória ficou consultável (busca funciona, categorias colapsam, paginação aparece)?
   - Novos problemas introduzidos pela refatoração?
6. **Remover** a edge function temporária ao fim.
7. **Relatório** por gravidade (🔴 bugs / 🟡 UX / 🟢 ok) com recomendação de próximos passos.

### Detalhes técnicos

- Função `dev-portal-magic-link` idêntica à usada na rodada anterior (`generateLink` type `magiclink` via admin API, retorna `action_link`).
- Playwright script sob `/tmp/browser/portal-audit-v2/`, screenshots em subpasta, script único por viewport.
- Nenhuma alteração de código de produto nesta etapa — só auditoria. Fixes vêm num plano seguinte, baseado nos achados.

### Entregável

Relatório estruturado igual ao da rodada anterior (bugs, UX, o que está bom, próximos passos priorizados), com screenshots anexados como evidência.