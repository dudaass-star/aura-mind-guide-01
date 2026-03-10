

# Reverter trava de sessão no scheduled-followup

## Alteração

Remover a verificação de sessão agendada nos próximos 7 dias do `scheduled-followup/index.ts`, mantendo-a apenas no `scheduled-checkin/index.ts`.

## Arquivo afetado

- `supabase/functions/scheduled-followup/index.ts` — remover o bloco de ~15 linhas que consulta `sessions` e faz `continue` (linhas adicionadas na última implementação, após o check de DND)

## Resultado final

| Função | Trava sessão 7 dias |
|---|---|
| `pattern-analysis` | Não |
| `conversation-followup` | Não |
| `scheduled-followup` (compromissos) | **Não** (reverter) |
| `scheduled-checkin` (check-in diário) | Sim (manter) |

Sem alterações no banco de dados.

