# Repensar Percurso e Memória

## Diagnóstico

**Percurso hoje:** timeline cronológica que empilha sessão + snapshot + carta + marco + insight, agrupada por mês. Vira um "feed" indefinido, sem hierarquia — cada item é um card igual ao outro. Não tem história, só cronologia. Compete com "Sobre você" (que já entrega curadoria) e perde.

**Memória hoje:** todas as entradas de `user_insights` listadas, agrupadas por categoria mas sem limite. Eduardo tem 111 insights → parede de texto. O CRUD é bom, o problema é o volume exposto de uma vez.

**Princípio que vai guiar a reformulação:** portal não é dashboard de dados; é espelho editorial. Cada aba tem um trabalho:
- **Sobre você** = quem você é (retrato, estável).
- **Percurso** = como você mudou (narrativo, temporal).
- **Memória** = o caderno dela (operacional, sob demanda).

Nenhuma delas deve ser uma lista infinita.

---

## Parte 1 — Percurso vira "Capítulos"

Substituir a timeline plana por **um card por mês**, tipo "capítulo de livro". Cada capítulo é uma síntese curta, não uma lista.

**Composição de um capítulo (ordem fixa, tudo opcional):**
1. **Título do mês** — ex: "Novembro · o mês em que você começou a soltar a Ana."
2. **Uma frase-resumo** (1-2 linhas) — vem do `monthly_letters.preview_text` ou do primeiro snapshot do mês.
3. **1 citação sua** — `evidence_quote` do snapshot de maior confiança do mês, em itálico com aspas.
4. **Chips de tema** — até 3 temas trabalhados naquele mês (dos snapshots).
5. **Rodapé**: "3 sessões · 1 marco" (contadores mudos, sem lista).
6. **Toque para expandir** → aí sim mostra: carta mensal completa + snapshots detalhados + marcos do mês. Recolhido por padrão.

**Ordem:** mês atual no topo, para baixo. Máximo **12 capítulos** visíveis; abaixo disso, botão "ver anos anteriores".

**Empty states:**
- Usuário novo (<30 dias, sem carta gerada ainda): card único "Seu primeiro capítulo chega em [data]" (reaproveita lógica que já criamos na antiga JornadaTab).
- Mês sem material suficiente: **não gera card** — pula o mês em silêncio.

**O que sai:** cards individuais de sessão, insight solto (pending_insight), marco isolado. Tudo isso agora vive **dentro** do capítulo expandido, não como itens de primeiro nível.

**Fonte de dados (nada novo):** `monthly_letters` + `thematic_snapshots` + `sessions(completed)` + `user_milestones`, agrupados por mês no cliente.

---

## Parte 2 — Memória vira "caderno navegável", não parede

Manter todo o CRUD atual (corrigir, apagar, marcar importante, adicionar). Mudar só a **apresentação**:

1. **Barra de busca** no topo — filtra por chave/valor em tempo real. Resolve 80% dos casos de "quero achar aquela entrada".

2. **Categorias como acordeões colapsados por padrão**, cada um com contador:
   - `Pessoas na sua vida (23)`
   - `Fatos e eventos (41)`
   - etc.
   - Só abre quando o usuário clica. Reduz a página inicial a ~6 linhas.

3. **Dentro do acordeão aberto:** mostra apenas as **10 primeiras** entradas (ordenadas por importância + mentioned_count, como hoje). Botão "ver mais 10" no fim. Nada de virtual scroll, nada de renderizar 111 divs de cara.

4. **Seção "Você contou pra Aura" (user_added) sempre visível no topo, expandida** — é o que o usuário criou, ele quer ver. Costuma ser pequena.

5. **Botão "Adicionar" continua no topo**, como hoje.

6. **Empty state por categoria:** se uma categoria tem 0 itens, ela **não aparece** — nada de acordeão vazio.

---

## Parte 3 — Sanity checks (evitar quebras colaterais)

- Badges de novidade em `usePortalNovidades`: continuam funcionando (mesmas tabs, mesmas queries de contagem).
- Rota `/meu-espaco` e ordem das tabs: sem mudança.
- Nenhuma migração de banco. Nenhum edge function novo.
- Query keys mudam (`percurso-*` → `capitulos-*`) — invalidations pontuais só onde faz sentido.
- Manter `pending_insight` visível: passa a ser um **banner acima dos capítulos** ("A Aura te mandou um insight essa semana — [ver]"), não vira card no meio da timeline.

---

## Arquivos afetados

- `src/components/portal/InsightsTab.tsx` — reescrito (agora renderiza "Capítulos").
- `src/components/portal/MemoriaTab.tsx` — reescrito (busca + acordeões + paginação por categoria), mantendo mutações intactas.
- `src/components/portal/hooks/usePortalNovidades.ts` — revisar queries se as keys mudarem (provável zero mudança, só releio).
- Sem mudanças em `UserPortal.tsx`, `SobreVoceTab.tsx`, `HojeTab.tsx` ou backend.

---

## Fora de escopo (deliberado)

- Não vou gerar "títulos de mês" via LLM agora — uso `monthly_letters.preview_text` ou fallback determinístico (`"Capítulo de [mês]"`). Se depois quisermos LLM, é uma segunda rodada.
- Não vou renomear a tab "Percurso" ainda — decidimos isso depois de você ver o resultado.
- Não mexo em Sobre você (você disse que está bom).
