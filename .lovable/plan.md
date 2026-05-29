## Problema

Na tela `/admin/users`, vários usuários novos (27/05) aparecem com D0 = **"Concluído"** mesmo tendo `0 feitas` e várias sessões só **agendadas** (ex.: Kely 0/8, Luiz 0/4, Thaiane 0/3, Rafael 0/3). Nenhum deles realmente fez a primeira sessão — só aceitaram o convite e o setup mensal criou as datas futuras.

## Causa raiz

`getD0Status` em `src/pages/AdminUsers.tsx` (linha 73) deriva o status só de dois flags do `profiles`:

```ts
if (pending && attempts === 0) → 'pendente'
if (pending && attempts >= 1)  → 'tentando'
if (!pending && needsSetup)    → 'recusado'
else                            → 'concluido'   // bucket genérico
```

O `else` final agrupa indistintamente:
- (a) quem **fez** a primeira sessão (D0 real cumprido),
- (b) quem **aceitou** o D0 mas ainda não fez nenhuma sessão (só tem agendadas futuras),
- (c) **legados** anteriores ao fluxo D0 binário.

Sem cruzar com `sessions`, não dá pra distinguir. Agora que admins têm acesso de leitura à tabela `sessions` (RLS aplicado na resposta anterior), dá pra refinar.

## Solução

Refinar `getD0Status` para considerar `SessionStats` e introduzir um novo estado **"Agendado"** (aceitou, tem sessão futura, ainda não fez nenhuma).

### Nova lógica de D0

```ts
type D0Status = 'pendente' | 'tentando' | 'recusado' | 'agendado' | 'concluido' | 'sem_dados';

function getD0Status(p: Profile, s?: SessionStats): D0Status {
  // Estados a partir do profile (alta prioridade — refletem fluxo D0 binário)
  if (p.pending_first_session_invite && (p.first_session_invite_attempts ?? 0) === 0) return 'pendente';
  if (p.pending_first_session_invite && (p.first_session_invite_attempts ?? 0) >= 1) return 'tentando';
  if (!p.pending_first_session_invite && p.needs_schedule_setup) return 'recusado';

  // A partir daqui o profile já não distingue — usar sessions
  if (s) {
    if (s.done >= 1) return 'concluido';        // fez ao menos uma sessão de fato
    if (s.upcoming >= 1) return 'agendado';     // aceitou, tem futura, ainda não fez
    if (s.abandoned >= 1 || s.noshow >= 1) return 'agendado'; // teve tentativa mas não concluiu
  }
  return 'sem_dados'; // legado / nunca passou pelo fluxo
}
```

### Novos labels e cores

| Status | Label | Cor |
|---|---|---|
| `pendente` | Pendente | amarelo |
| `tentando` | Tentando Nx | azul |
| `recusado` | Recusou→Setup | laranja |
| `agendado` | **Agendado** (novo) | índigo |
| `concluido` | **Fez 1ª sessão** (rótulo mais claro) | verde |
| `sem_dados` | Sem dados | cinza |

### Filtros

O dropdown "D0" passa a oferecer os 6 estados (em vez de 4). Substituir o filtro client-side existente para usar o novo `getD0Status(p, sessionStats[p.user_id])`.

## Arquivos alterados

- `src/pages/AdminUsers.tsx` — único arquivo. Refinar `getD0Status`, adicionar `agendado`/`sem_dados` em `D0Status`, `d0Labels`, `d0Colors`, no `<Select>` de filtro e passar `sessionStats[p.user_id]` na chamada dentro do `map` da tabela.

## O que NÃO muda

- Zero migration (a RLS de `sessions` já foi liberada na rodada anterior).
- Zero alteração em edge functions, prompts, ou fluxo de criação de sessão.
- Lógica de `SessionStats`, ratings e abandono permanecem idênticas.
- Para usuários onde o `sessionStats` ainda não carregou (loading), o fallback continua sendo o comportamento atual via flags do profile.

## Verificação

Após aplicar, na lista:
- Kely (0/8 agendadas) → **Agendado** (não mais "Concluído").
- Samuel Venuto (1/1, status canceled) → **Fez 1ª sessão**.
- Nathalia (0/0, needsSetup) → continua **Recusou→Setup**.
- Danúbia (com sessão completed) → **Fez 1ª sessão**.
- Legados sem sessões nem flags D0 → **Sem dados** (revela o quanto é populado puramente pelo `else` antigo).
