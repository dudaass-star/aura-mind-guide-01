## Problema (geral, não específico ao Eduardo)

Hoje, em `src/components/portal/JornadasTab.tsx`, a aba **Jornadas** do `/meu-espaco` só renderiza:

- a `current_journey_id` do perfil, e
- jornadas presentes em `user_journey_history`.

Isso causa dois problemas para qualquer usuário:

1. **Jornadas concluídas somem** sempre que `user_journey_history` está vazio ou incompleto — basta o contador `profile.journeys_completed` estar à frente do histórico (caso comum em perfis antigos, migrações de conta, ou completions feitas antes da função `choose-next-journey` ter sido criada).
2. **Não há como o usuário explorar/relembrar** uma jornada que ele ainda não fez, mesmo as ativas em `content_journeys`. O catálogo fica invisível.

## Solução (mudança apenas de UI, sem alterar backend nem migrar dados)

Reformular `JornadasTab.tsx` para mostrar **todas as jornadas ativas** de `content_journeys`, classificadas em três estados visuais:

- **Atual** — `journey.id === profile.current_journey_id`. Card destacado, progresso real (`current_episode / total_episodes`), episódios desbloqueados até o atual.
- **Concluída** — presente em `user_journey_history`. Card com badge "Concluída", todos os episódios desbloqueados para revisitar.
- **Disponível** — qualquer outra jornada ativa. Card sutil, badge "Disponível", expansível para mostrar a lista de episódios em modo "preview" (lock visual mas título visível, ou primeiro episódio liberado — decisão abaixo).

### Ordenação

1. Atual (sempre primeira)
2. Concluídas (mais recente primeiro, via `user_journey_history.completed_at`)
3. Disponíveis (na ordem `content_journeys.created_at`)

### Estado "Disponível" — comportamento dos episódios

Para evitar criar nova feature de "iniciar jornada por conta própria" (que mexeria no backend), os episódios das jornadas **Disponíveis** ficam visíveis (título + stage) mas o clique fica **desabilitado** com tooltip "A Aura vai te guiar até esta jornada na hora certa". Assim o catálogo é transparente sem quebrar o fluxo de progressão guiada.

Episódios de jornadas **Concluídas** continuam clicáveis (abrem `/episodio/:id`) — é o ganho real para o usuário.

### Gap entre contador e histórico

Se `profile.journeys_completed > user_journey_history.length`, exibir abaixo do contador uma linha discreta:

> *"Algumas jornadas antigas podem não estar disponíveis para revisita."*

Sem botões nem ações — apenas explica o gap.

### Empty state

Só aparece se `content_journeys` retornar 0 jornadas ativas (situação de catálogo vazio). Qualquer perfil sem `current_journey_id` e sem histórico passará a ver as Disponíveis em vez do "Nenhuma jornada disponível" atual.

## Arquivos afetados

- **`src/components/portal/JornadasTab.tsx`** — única mudança:
  - Remover o `filter` que reduz a `currentJourneyId + completedJourneyIds`.
  - Introduzir o tri-estado (`status: 'current' | 'completed' | 'available'`) e ordenar.
  - Adicionar badge "Disponível" e tooltip no clique de episódios bloqueados por disponibilidade (vs. lock por progressão dentro da jornada atual, que continua igual).
  - Adicionar a nota condicional do gap.

Sem mudanças em edge functions, sem migrações, sem dados específicos de usuário.

## Validação

1. Eduardo (caso real): passa a ver "Construindo Autoconfiança" (Atual), eventuais concluídas que existam no histórico, e as demais jornadas ativas como Disponíveis.
2. Usuário novo (sem `current_journey_id`): vê o catálogo inteiro como Disponível, sem mais empty state.
3. Usuário com `journeys_completed=3` e histórico de 1: vê 1 card Concluído + a nota discreta do gap.
4. Episódios de Concluídas abrem `/episodio/:id?u=...&t=...` normalmente.
