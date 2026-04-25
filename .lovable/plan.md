
# Fechamento Conduzido com Retomada Datada

## Problema
Hoje a Aura, em conversas livres, extrai o "menor passo" do usuário e a conversa termina no vazio. O usuário sente que resolveu, fecha o WhatsApp e a Aura nunca mais volta àquele fio. Resultado: o serviço parece "pontual" (resolveu uma vez, churn na renovação).

## Princípio
Manter intacta a metodologia (Logoterapia: Presença → Sentido → Movimento) e o "menor passo" como coração da Fase 3. **A única mudança é que o micro passo passa a vir amarrado a um marco temporal de retomada concreto** — escolhido deterministicamente pelo backend, não inventado pela IA.

Três rotas, escolhidas pelo sistema com base em dados reais do usuário:

```text
Tem sessão agendada em ≤7 dias?
   ├─ SIM  → bridge verbal: "a gente retoma isso na sessão de [dia]"
   └─ NÃO  → Plano permite sessões? (Direção/Transformação)
              ├─ SIM  → convidar a marcar sessão
              └─ NÃO (Essencial) → agendar reminder datado via [AGENDAR_TAREFA]
```

Nenhuma rota cria promessa que o canal não cumpra: as duas primeiras são puramente verbais; a terceira usa infraestrutura existente (`scheduled_tasks` → `execute-scheduled-tasks` → `sendProactive`), que dentro da janela de 24h entrega o gancho contextual livre e fora da janela cai no template aprovado `cheking_7dias` (semântica genérica de "voltei pra conversar"), reabrindo a janela sem quebra de confiança.

## Mudanças (todas em `supabase/functions/aura-agent/index.ts`)

### 1. Novo bloco determinístico no `dynamicContext` — "FECHAMENTO RECOMENDADO"

Injetado próximo ao bloco `AGENDA DO USUARIO` (linha ~4627), só é montado quando:
- Não há sessão ativa em andamento
- Conversa tem ≥4 trocas profundas no histórico recente
- Cooldown respeitado (ver guardrails)

O bloco diz à Aura, em texto, qual das três rotas seguir e quais parâmetros usar (data sugerida, horário, nome do tema). A Aura mantém liberdade poética de redação, mas a ROTA é determinística.

Exemplo (rota Essencial):
```
🔚 FECHAMENTO RECOMENDADO (quando o micro passo emergir):
Rota: AGENDAR_RETOMADA
Data sugerida: 2026-04-27 19:00 (3 dias à frente, horário preferido do usuário)
Ao usuário concordar com o micro passo, emita:
[AGENDAR_TAREFA:2026-04-27 19:00:reminder:Oi! Vim ver como foi com {micro passo}. Conseguiu testar?]
```

### 2. Ajuste cirúrgico em `sentido_to_movimento` (linha 926)

Adiciona ao bloco existente uma instrução de "amarração temporal" condicionada ao bloco FECHAMENTO RECOMENDADO. Texto novo, em português:

> Quando o micro passo emergir e houver bloco "FECHAMENTO RECOMENDADO" no contexto, AMARRE o passo a um marco futuro real conforme a rota indicada. Não invente datas — use o que o sistema indicou. Se não houver bloco, encerre normalmente sem amarração.

### 3. Ajuste no bloco Fase 3 do prompt principal (linha 2111-2118)

Adiciona uma linha após "Ação sem sentido não sustenta":

> Movimento sem retomada vira esquecimento. Quando o sistema indicar uma rota de retomada (sessão futura ou reminder), feche conectando o micro passo a esse marco.

### 4. Lógica de seleção de rota (nova função no `aura-agent/index.ts`)

Função pura `selectClosureRoute(profile, upcomingSessions, recentMessages)` que retorna `{ route: 'session_bridge' | 'suggest_session' | 'schedule_reminder' | 'none', params: {...} }`. Chamada no fluxo de montagem do `dynamicContext`.

Critérios:
- `none` → conversa curta (<4 trocas), modo crise/segurança ativo, sessão ativa em andamento, cooldown não respeitado
- `session_bridge` → existe sessão `scheduled` nos próximos 7 dias
- `suggest_session` → plano com `sessions_per_month > 0` e sem sessão agendada
- `schedule_reminder` → plano Essencial (ou plano com sessões esgotadas no mês)

Parâmetros calculados: data/hora (3 dias à frente, default 19h ou `preferred_session_time`), nome próximo da sessão (se aplicável).

## Guardrails

- **Cooldown anti-empilhamento:** antes de injetar a rota `schedule_reminder`, consultar `scheduled_tasks` filtrando `user_id`, `task_type='reminder'`, `status='pending'`, `execute_at > now()`. Se já existe um reminder pendente desse tipo, retorna `route='none'` (não empilha).
- **Cooldown geral:** rota só é sugerida se a última mensagem da Aura no histórico recente **não contém** indícios de fechamento já feito (heurística simples: ausência de `[AGENDAR_TAREFA]` nas últimas 5 mensagens da assistente).
- **Janela de 4 trocas mínimas:** evita acionar fechamento em ping-pong leve.
- **Bypass em crise:** se `crisis_mode` ou `safety_protocol` estiverem ativos no contexto, `route='none'`.
- **Sem mudança de schema:** zero migrations, zero novas colunas, zero novos templates Meta.

## O que NÃO muda
- Micro-agente de fases (`evaluateTherapeuticPhase`, `PHASE_INDICATORS`, enum `aura_phase`) — intacto.
- Prompt de sessão ativa, modos de áudio, protocolos de crise — intactos.
- Templates WhatsApp aprovados — nenhum novo, nenhum alterado.
- `execute-scheduled-tasks` e `sendProactiveMessage` — usados como já existem.
- Tabela `scheduled_tasks` — só leitura adicional para cooldown; escrita continua sendo via tag `[AGENDAR_TAREFA]` que a Aura já emite hoje.

## Risco e plano de rollback
- Risco baixo: mudança é aditiva, em prompt + uma função pura. Se algo sair errado, basta remover a injeção do bloco "FECHAMENTO RECOMENDADO" no `dynamicContext` (uma linha) que o comportamento volta exatamente ao atual.
- Sem efeito retroativo: usuários sem sessão futura e sem 4 trocas profundas no histórico simplesmente não recebem o bloco — comportamento idêntico ao de hoje.

## Detalhes técnicos resumidos
- Arquivo afetado: `supabase/functions/aura-agent/index.ts`
- Linhas tocadas (aprox.): 926 (FREE_PHASE_INSTRUCTIONS), 2111-2118 (prompt Fase 3), 4627 (injeção no dynamicContext), nova função utilitária ~50 linhas
- Sem migrations, sem mudança de tabela, sem novo secret
- Sem novo deploy de outras edge functions (a infra de `[AGENDAR_TAREFA]` e `execute-scheduled-tasks` já está em produção)

## Validação após deploy
1. Conversa profunda no Essencial sem sessão agendada → Aura deve fechar com data específica e a tag `[AGENDAR_TAREFA]` deve aparecer nos logs.
2. Conversa profunda com sessão marcada em 3 dias → Aura deve mencionar a sessão verbalmente, **sem** emitir `[AGENDAR_TAREFA]`.
3. Conversa profunda no Direção sem sessão marcada → Aura deve sugerir marcar sessão, **sem** emitir `[AGENDAR_TAREFA]`.
4. Conversa curta de ping-pong → comportamento idêntico ao atual (sem bloco de fechamento).
5. Após 1 reminder agendado, nova conversa profunda no mesmo dia → Aura **não** agenda outro (cooldown via `scheduled_tasks`).
