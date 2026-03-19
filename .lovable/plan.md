

# Remoção Completa do Sistema de Trial Legado

Entendi: o trial agora é simplesmente o plano normal com 7 dias grátis via cartão. O Stripe cuida da cobrança no 8o dia. A experiência do usuário é idêntica a um assinante ativo — sem limites, sem nudges, sem follow-ups de conversão.

## O que será removido

### 1. `process-webhook-message/index.ts`
- **Remover bloco inteiro "TRIAL LIMIT CHECK"** (linhas 348-499): contagem de mensagens, AHA detection, nudge response bonus, hard limit 50/72h, agendamento de trial_closing + follow-ups, e o `return` que bloqueia o usuário
- **Remover detecção de `[VALOR_ENTREGUE]`** (linhas 838-846): atualização de `trial_phase` baseada na tag

### 2. `aura-agent/index.ts`
- **Remover bloco "Contexto de TRIAL Primeira Jornada"** (linhas 3757-3865): todos os nudges (msg 45, 48, 50, pós-AHA), notas internas de contagem, e instrução da tag `[VALOR_ENTREGUE]`
- **Remover parâmetros** `trial_count`, `trial_phase`, `trial_aha_at_count` do destructuring do request body e de qualquer uso

### 3. `execute-scheduled-tasks/index.ts`
- **Remover cases**: `trial_closing`, `trial_followup_15m`, `trial_followup_2h`, `trial_followup_morning`, `trial_followup_48h`, `trial_activation_audio`, `trial_ghost_nudge`
- Manter os cases `reminder`, `meditation`, `message` intactos

### 4. `start-trial/index.ts`
- **Remover agendamento** de `trial_activation_audio` e `trial_ghost_nudge` (linhas ~218-235)
- Manter: criação do perfil, mensagem de boas-vindas, CAPI event

### 5. `reactivation-blast/index.ts`
- **Remover reset de campos trial** (`trial_conversations_count: 0`, `trial_phase: 'listening'`, `trial_aha_at_count: null`, `trial_nudge_active: false`)
- Manter apenas `last_reactivation_sent` update

### 6. Cleanup de dados (migration SQL)
- Cancelar todos os `scheduled_tasks` pendentes com `task_type` em: `trial_closing`, `trial_followup_*`, `trial_activation_audio`, `trial_ghost_nudge`

## O que NÃO muda
- `status = 'trial'` continua existindo (Stripe gerencia a transição)
- `trial_started_at` continua sendo salvo (referência para o período de 7 dias)
- `start-trial` continua criando o perfil e enviando boas-vindas
- Colunas `trial_conversations_count`, `trial_phase`, etc. ficam no banco sem uso (cleanup posterior)

