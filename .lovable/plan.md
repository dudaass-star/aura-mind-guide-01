## Diagnóstico

Verifiquei no banco e o problema é geral, não só do Eduardo:

- A tabela `user_journey_history` tem apenas **7 linhas no total** (todos os usuários somados).
- Vários perfis têm `profiles.journeys_completed` inflado sem nenhuma linha correspondente em `user_journey_history` (Eduardo=3/0, Letícia=3/0, Clara=3/0, etc.).
- Causa raiz: em algum momento o contador `journeys_completed` foi incrementado sem o `insert` em `user_journey_history` (versão antiga da `periodic-content` ou backfill manual). Hoje as duas escritas estão no mesmo bloco, mas o histórico de quem completou antes disso está perdido — **não há como recuperar quais jornadas específicas foram concluídas**, só o número.

Por isso a UI atual fala "3 jornadas completadas" mas não consegue listar nenhuma: ela depende do `user_journey_history` para saber *qual* jornada marcar como Concluída, e esse dado simplesmente não existe.

## Solução (UI-only, geral para todos)

Tratar `user_journey_history` como **única fonte de verdade** na aba Jornadas e parar de usar `profile.journeys_completed` como contador visível.

Mudanças em `src/components/portal/JornadasTab.tsx`:

1. **Contador "X jornadas completadas"** passa a usar `completedJourneyIds.size` (derivado de `user_journey_history`) em vez de `profile.journeys_completed`. O número mostrado sempre bate com os cards Concluídos visíveis logo abaixo — zero dissonância.
2. **Remover a nota "Algumas jornadas antigas podem não estar disponíveis para revisita"**. Sem o contador inflado, não há mais gap para explicar.
3. **Esconder o bloco do contador** quando `completedJourneyIds.size === 0` (em vez de "0 jornadas completadas", simplesmente não mostra nada — mais limpo para usuários novos).
4. Resto da estrutura permanece igual: cards Atual / Concluída / Disponível na mesma ordem, episódios clicáveis nas Concluídas, lock + tooltip nas Disponíveis.

## Por que essa abordagem

- **Honestidade**: o usuário vê exatamente o que pode revisitar.
- **Sem backfill arriscado**: não inventamos histórico que não existe (não sabemos *quais* 3 jornadas Eduardo concluiu).
- **Convergência natural**: conforme novas jornadas forem concluídas pela `periodic-content` (que hoje já escreve nos dois lugares), contador e histórico crescem juntos.
- **Sem backend, sem migração, sem mexer em dados de usuário.**

## Arquivos afetados

- `src/components/portal/JornadasTab.tsx` — única alteração.

## Validação

1. Eduardo: contador some (history=0), vê só "Construindo Autoconfiança" como Atual e as demais como Disponíveis. Sem mensagens contraditórias.
2. Usuário que completar uma jornada via fluxo normal a partir de agora: aparece o contador "1 jornada completada" + card Concluída clicável.
3. Usuário novo sem jornada atual: vê catálogo inteiro como Disponível, sem bloco de contador.
