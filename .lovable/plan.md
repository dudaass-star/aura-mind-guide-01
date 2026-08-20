# Perfis de clientes: transformar o que já existe em leitura rápida

## Resposta curta

Sim, o dado existe — mas hoje não é "encontrável rápido". O que verifiquei no banco agora:

- `session_themes`: 16.475 linhas, 230 usuários (4.543 linhas em clientes ativos/trial). Atualizado até hoje.
- `user_insights`: 20.244 fatos em 81 usuários, categorizados: contexto (9.9k), preferência (3.6k), pessoa (2.1k), padrão (1.7k), objetivo (1.5k), trauma (701), conquista (641).
- `user_evolution_summary`: 196 resumos narrativos.
- `user_portraits`: 36 retratos prontos (só 18 são de clientes ativos/trial).
- `thematic_snapshots`: praticamente vazio (2 linhas, 1 usuário) — não serve como base de perfil hoje.

Dois problemas impedem usar isso como "perfil de cliente":

1. **Ruído e duplicidade nos temas.** No topo da lista aparecem `ansiedade` (62 usuários) e `Ansiedade` (17) como temas diferentes; `cansaço` (32) e `cansaco` (17) idem. E há tema operacional que não é tema de vida: `agendamento de sessões` (32) e `agendamento de sessão` (20) somam mais gente que "culpa".
2. **Não existe nenhuma tela ou consulta agregada.** Tudo é por usuário. Não há como responder "quais são os 5 perfis de cliente que eu tenho" sem consulta manual.

## O que fazer

### 1. Camada de normalização de temas (sem apagar dado)
Criar uma view `public.session_themes_normalized` que:
- normaliza `theme_name` (minúsculas, sem acento, sem pontuação) para fundir `Ansiedade`/`ansiedade`/`cansaco`/`cansaço`;
- aplica um mapa de sinônimos curto e explícito (ex.: exaustão/esgotamento/cansaço → `cansaço`; paz/paz interior/alívio → `alívio`; autonomia/independência emocional → `autonomia`);
- marca temas operacionais como ruído (`agendamento*`, `sessão`, `pagamento`, `plano`) via coluna `is_noise`, para ficarem fora dos rankings sem perder histórico.

### 2. Painel "Perfis de clientes" no admin
Nova aba/página admin com três blocos:
- **Mapa de temas**: ranking de temas normalizados por número de clientes, filtrável por status (ativos/trial/cancelados) e por janela (30/90/365 dias / tudo). Mostra tema, nº de clientes, nº de sessões, % da base.
- **Clusters (perfis)**: agrupamento por combinação dos eixos que já temos — tema dominante + categoria de insight predominante (trauma/objetivo/padrão) + plano + tempo de casa. A saída é uma lista de 4-8 clusters com tamanho, temas típicos e 3 exemplos clicáveis de clientes.
- **Ficha do cliente**: ao clicar, abre painel lateral com o retrato (`user_portraits`), o resumo evolutivo, os temas ativos e os insights de maior prioridade — a leitura de perfil em uma tela.

### 3. Cobertura dos retratos
Só 18 dos 55 clientes ativos/trial têm retrato gerado. Rodar o gerador de retratos em lote para os ativos sem retrato, para o painel não nascer com metade da base vazia.

## Detalhes técnicos

- **Migração**: cria a view normalizada + índice de apoio em `session_themes(user_id, status, last_mentioned_at)`. Nenhuma tabela nova, nenhum dado destruído.
- **Edge function** `admin-customer-profiles` (verify_jwt padrão + checagem `has_role('admin')`, igual `admin-messages`): endpoints `?action=themes`, `?action=clusters`, `?action=profile&user_id=`. Agregação em SQL, não no cliente. Atenção ao limite de 1000 linhas do PostgREST — usar RPC/agregação server-side.
- **Front**: nova página `src/pages/AdminProfiles.tsx` + rota no `App.tsx`, no mesmo padrão visual dos painéis admin atuais. Sem dependência nova.
- **Clusterização**: regra determinística em SQL (tema dominante + categoria dominante), sem LLM. Se depois quisermos rótulos narrativos ("A exausta que não pede ajuda"), aí sim uma passada de Flash-Lite gerando o nome de cada cluster — fica como fase 2.

## Fora de escopo

- Reprocessar `thematic_snapshots` (base vazia, decisão separada).
- Deduplicar temas destrutivamente no banco.
- Rótulos de cluster gerados por IA (fase 2).
