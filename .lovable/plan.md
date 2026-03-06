

## Corrigir: Atribuir jornada padrão no start-trial

### Problema
A função `start-trial` cria o perfil sem `current_journey_id`. A jornada só é atribuída se o aura-agent completar o onboarding via conversa. Se o usuário não conversar ou o parse falhar, ele fica sem jornada e nunca recebe conteúdo periódico.

### Solução
Atribuir `current_journey_id: 'j1-ansiedade'` e `current_episode: 0` já na criação do perfil no `start-trial`. Assim, todo usuário novo já entra elegível para receber conteúdo de jornada desde o início. Se o aura-agent detectar um tema mais adequado durante o onboarding, ele sobrescreve com a jornada correta (esse comportamento já existe).

### Mudança

**Editar**: `supabase/functions/start-trial/index.ts` (linhas 88-98) — adicionar `current_journey_id: 'j1-ansiedade'` e `current_episode: 0` no insert do perfil.

### Correção da Nilda Rita
Além da mudança no código, será necessário atualizar o perfil da Nilda Rita no banco para atribuir a jornada `j1-ansiedade` manualmente (e resolver a duplicidade de perfil, se ainda existir).

