

## Diagnóstico: Dois Problemas Encontrados

### Problema 1: Sem mensagens bônus para reativados
A implementação atual faz apenas **1 coisa**: se o usuário responde a um nudge, aquela resposta não conta no trial (`isNudgeResponse` = skip counter). Mas **não dá mensagens extras**.

Cenário real:
- Usuário parou na conversa 4/5, foi reativado pelo nudge
- Responde ao nudge → "grátis" (fica em 4/5)
- Próxima mensagem real → 5/5, trial acaba
- Só teve **1 mensagem útil** após voltar — experiência ruim

Cenário pior:
- Usuário já estava em 5/5, recebe nudge pós-trial
- Responde ao nudge → grátis (fica em 5/5)
- Próxima mensagem → **bloqueada imediatamente** — péssimo

### Problema 2: Mensagem de encerramento não é enviada após reativação
O `trial_closing` só é agendado quando `newCount === 5` (linha 493). Se o usuário já estava em 5/5 e respondeu a um nudge (sem incrementar), o `newCount === 5` nunca é atingido novamente. O encerramento com link de checkout **não é enviado**.

---

## Plano de Correção

### Mudança 1: Bônus de 3 mensagens para quem volta via nudge
**Arquivo:** `supabase/functions/webhook-zapi/index.ts`

Quando `isNudgeResponse === true` e `trialCount >= 3`:
- Setar `trial_conversations_count = trialCount - 3` (dar 3 mensagens extras)
- Isso garante que quem volta tem pelo menos 3 interações reais antes do trial acabar
- Se `trialCount < 3`, zerar para 0 (dar todas de volta)

Isso move o check de bônus para **dentro** do bloco `isNudgeResponse`, antes do limit check.

### Mudança 2: Reordenar a lógica — nudge response ANTES do limit check
**Arquivo:** `supabase/functions/webhook-zapi/index.ts`

Atualmente a ordem é:
1. Detecta nudge response
2. Checa limite (trialCount >= 5 → bloqueia)

Precisa ser:
1. Detecta nudge response → **aplica bônus** (reduz counter em 3)
2. Checa limite com o counter **já atualizado**

### Mudança 3: Agendar trial_closing após esgotarem as mensagens bônus
**Arquivo:** `supabase/functions/webhook-zapi/index.ts`

O `trial_closing` já é agendado quando `newCount === 5`. Com o bônus aplicado, o counter vai naturalmente chegar a 5 de novo, e o closing será agendado normalmente. Nenhuma mudança extra necessária aqui.

---

### Resumo

| O que muda | Onde |
|---|---|
| Aplicar bônus de 3 msgs quando `isNudgeResponse` e `trialCount >= 3` | `webhook-zapi/index.ts` (bloco trial, ~linha 451) |
| Reordenar: aplicar bônus antes do limit check | `webhook-zapi/index.ts` (mover lógica) |
| Garantir que `trial_closing` funcione na 2a passagem pelo count 5 | Já funciona com a reordenação |

Mudança em **1 arquivo**, ~15 linhas alteradas.

