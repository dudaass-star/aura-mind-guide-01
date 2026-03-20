

# Lock Atômico + Cleanup nos Early Returns

## Arquivo: `supabase/functions/process-webhook-message/index.ts`

## Contexto
O plano anterior (lock atômico com UPDATE condicional) move a aquisição do lock para a linha ~337. Isso cria um novo problema: os 8+ early returns entre as linhas 378-567 agora acontecem com o lock ativo, travando o usuário por 60s se não forem liberados.

## Mudança 1 — Linhas 333-356: Lock atômico (do plano aprovado)

Substituir o SELECT + check por UPDATE condicional `.eq('is_responding', false).select()`. Sem mudanças em relação ao plano anterior.

## Mudança 2 — Helper function para unlock + return

Criar uma função auxiliar no início do handler para evitar repetição:

```typescript
const releaseLock = async () => {
  await supabase
    .from('aura_response_state')
    .update({ is_responding: false })
    .eq('user_id', profile.user_id);
};
```

## Mudança 3 — Adicionar `releaseLock()` antes de cada early return

Cada return intermediário precisa liberar o lock antes de sair:

| Local | Linha aprox. | Motivo do return |
|---|---|---|
| Audio transcription failed | 385 | Áudio sem texto |
| Capsule audio received | 412 | Recebeu áudio da cápsula |
| Capsule awaiting audio reminder | 423 | Lembrete de cápsula |
| Capsule audio replaced | 438 | Regravou áudio |
| Capsule cancelled | 454 | Cancelou cápsula |
| Capsule saved | 484 | Cápsula confirmada e salva |
| Rating handled | 519 | Nota da sessão |
| Confirmation handled | 537 | Confirmação de sessão |
| Debounce | 567 | Mensagem mais recente existe |

Em cada um, adicionar `await releaseLock();` na linha anterior ao `return`.

## Mudança 4 — try/finally (do plano aprovado)

O `try...finally` ao redor do agent call + send loop permanece como safety net, sem alterações.

## Resumo

| Aspecto | Plano anterior | Plano atualizado |
|---|---|---|
| Lock atômico | Sim | Sim (sem mudança) |
| Early returns | NÃO tratados | 9 returns com `releaseLock()` |
| Helper function | N/A | `releaseLock()` para DRY |
| try/finally | Sim | Sim (sem mudança) |

**1 arquivo, ~15 linhas adicionais** em relação ao plano anterior.

