
## Princípio

**Subtrair, não somar.** Remover do prompt da Aura todas as instruções que mandam (ou autorizam) projetar/dramatizar emoção. Sem adicionar bloco "anti-dramatização".

## Diagnóstico (validado linha a linha)

8 ocorrências do mesmo vetor em `supabase/functions/aura-agent/index.ts`:

| # | Linha | Bloco | Padrão |
|---|-------|-------|--------|
| 1 | 1032 | SESSION_PHASE_INSTRUCTIONS | "Nomeie o que está por baixo, não o que está na superfície." |
| 2 | 1034 | mesma | "CONFRONTO CIRÚRGICO **OBRIGATÓRIO**: Pelo menos 1 confronto..." |
| 3 | 1061 | FREE_PHASE_INSTRUCTIONS | "nomeie com suas próprias palavras o que está por baixo do que foi dito" |
| 4 | 1435 | guidance Presença→Sentido (free) | "Traga UMA observação profunda... nomeie o que está por baixo." |
| 5 | 2758-2760 | MODO PROFUNDO Fase 1 | Exemplo "Certo: Você não tá falando só de dinheiro. Tá falando de identidade..." |
| 6 | 3426 | exploration phase (sessão) | "Camada 2 — EMOÇÃO: O que sentiu? **(nomeie a emoção se o usuário não nomear)**" |
| 7 | 3429 | mesma | "respostas curtas... ainda na superfície. Vá mais fundo antes de avançar." |
| 8 | 3474 | cardápio Reframe | "CONFRONTO CIRÚRGICO **(obrigatório pelo menos 1x na fase de Reframe)**" |

## Mudanças no prompt (subtração)

### A. Linha 3426
Apagar `(nomeie a emoção se o usuário não nomear)`. Linha vira: `Camada 2 — EMOÇÃO: O que sentiu?`

### B. Padrão "nomeie o que está por baixo" (4 pontos)
- **Linha 1032** — apagar a linha inteira.
- **Linha 1061** — trocar `nomeie com suas próprias palavras o que está por baixo do que foi dito` por `devolva com suas próprias palavras o que o usuário trouxe`.
- **Linha 1435** — trocar `Traga UMA observação profunda com suas próprias palavras (sem fórmula fixa) — nomeie o que está por baixo.` por `Traga UMA observação concreta sobre o que o usuário descreveu (sem fórmula fixa).`
- **Linhas 2758-2760** — apagar as 3 linhas (instrução + Errado + Certo). Fase 1 segue direto na linha 2762 ("Antídoto do eco interpretativo").

### C. Linha 3429
Apagar a frase inteira.

### D. Tirar "OBRIGATÓRIO" do confronto cirúrgico
- **Linha 1034** — vira: `⚠️ CONFRONTO CIRÚRGICO: Use quando perceber padrão repetido (2+ aparições nesta sessão) ou contradição clara.`
- **Linha 3474** — `(obrigatório pelo menos 1x na fase de Reframe):` vira `(use quando houver padrão repetido ou contradição clara):`

### E. Guarda de idade para `last_user_context` vulnerable/crisis (Opção 1)

**Verificado:**
- `last_user_context` chega via `req.json()` (linha 4238), **não** vem de select. O `updated_at` está em `aura_response_state` e já é atualizado nas linhas 1648, 2200, 4378 — sem migration.
- Schema confirmado: `aura_response_state.user_id uuid` (chave). O select `.eq('user_id', profile.id)` está correto.

**Implementação:**

1. Antes da chamada do evaluator (linha 6120), só quando `last_user_context?.user_emotional_state` for `'vulnerable'` ou `'crisis'`:
   ```ts
   let lastUserContextUpdatedAt: string | null = null;
   if (last_user_context?.user_emotional_state === 'vulnerable' ||
       last_user_context?.user_emotional_state === 'crisis') {
     const { data } = await supabase
       .from('aura_response_state')
       .select('updated_at')
       .eq('user_id', profile.id)
       .maybeSingle();
     lastUserContextUpdatedAt = data?.updated_at ?? null;
   }
   ```
2. Passar `lastUserContextUpdatedAt` como argumento extra para `evaluateTherapeuticPhase`.
3. Dentro da função (linhas 1144-1156), só aplicar o reset `vulnerable/crisis` se `updated_at` for **< 10 minutos** do agora. Caso contrário, label antigo é descartado e o evaluator segue o fluxo normal.

**Trade-off:** 1 query extra só nos turnos com label de alto-risco — custo desprezível, sem mudar caller.

## O que NÃO mexer

- **Linha 2746** — exceção PING-PONG (já isenta VALIDA+ENTREGA/GUARDRAIL/CARDÁPIO). Funciona.
- **Linhas 2764 e 2766** — VALIDA+ENTREGA e GUARDRAIL SIMÉTRICO (anti-loop socrático, caso Jeferson).
- `OBRIGATÓRIO` nas linhas 1257, 1341, 3016, 5624, 6050 — contexto diferente (tags de saída/fechamento/PAUSAR_SESSOES).
- `memory_corrections`, posição no cache, blocos guard-rail.

## Validação pós-deploy

1. **Drift de deploy:** query em `failed_message_log` por 10 min após o deploy.
2. **Smoke test conceitual:**
   - "Liberdade! Conversar com pessoas" → resposta factual, sem "oxigênio / morreu / encolheu".
   - "trabalho de casa" → sem "exausta de ser a adulta / mora o perigo / sufoca".
3. **Logs `aura-agent`:** PHASE_INSTRUCTIONS não traz mais "Nomeie o que está por baixo" nem "OBRIGATÓRIO" no confronto.
4. **`user_memory_corrections`** por 7 dias: queda nas correções "não interprete sem confirmação".

## Risco e reversão

- 7 trechos subtraídos do prompt + 1 select pontual + 1 guarda de idade no evaluator. Baixo risco.
- Reverter = restaurar os trechos no arquivo, remover o select e a guarda. Sem efeito em DB.
