## Diagnóstico

O follow-up da imagem veio da função `conversation-followup`, não de uma resposta normal da Aura.

Fluxo provável:
1. A Aura respondeu às 15:31 com pergunta: “A febre deu uma trégua?”
2. Como qualquer resposta com `?` vira `conversation_status = awaiting`, o webhook marcou a conversa como “pendente”.
3. Depois de 15 minutos sem resposta, o cron `conversation-followup` rodou.
4. A IA extraiu o contexto das mensagens recentes, misturou o tema de agenda/sessões com o assunto da febre, e gerou: “E aí, tudo certo com os agendamentos? 😉 Adoraria saber se deu certo!”

O problema não é só a frase. É o mecanismo: ele tenta “reabrir” qualquer conversa que terminou com pergunta, mesmo quando o silêncio é natural. Isso fica invasivo, ansioso e anti-natural.

## Plano

### 1. Desativar follow-ups automáticos de conversa comum
Alterar `process-webhook-message/index.ts` para não habilitar `conversation_followups` quando a conversa comum fica em `awaiting`.

Hoje:
```ts
const shouldEnableFollowup = conversationStatus === 'awaiting' || isSessionActive;
```

Novo comportamento:
```ts
const shouldEnableFollowup = isSessionActive;
```

Resultado: perguntas normais da Aura não geram mais “ei, você sumiu?” depois de 15 minutos.

### 2. Manter apenas segurança para sessão ativa
Preservar follow-up somente quando existir sessão ativa (`current_session_id` / `session_active = true`), porque ali o usuário está dentro de uma sessão de 45 minutos e uma interrupção pode precisar de retomada.

Isso remove o incômodo em ping-pong/casual sem quebrar sessões formais.

### 3. Blindar a função `conversation-followup`
Adicionar uma guarda dentro de `conversation-followup/index.ts` para pular qualquer caso que não esteja em sessão ativa.

Mesmo se algum registro antigo ficar na tabela, a função não enviará follow-up comum.

### 4. Limpar/neutralizar registros pendentes
Adicionar uma limpeza segura para registros já existentes em `conversation_followups` que não sejam sessão ativa, evitando que follow-ups antigos ainda disparem depois do deploy.

### 5. Atualizar memória do projeto
Criar/atualizar memória dizendo:
- follow-up automático de conversa comum foi removido porque soa forçado;
- Aura deve deixar ping-pong morrer naturalmente;
- follow-up só permanece para sessão ativa ou fluxos determinísticos específicos.

## Fora de escopo

- Não mexer em lembretes de sessão agendada.
- Não mexer em tarefas explicitamente pedidas pelo usuário (`AGENDAR_TAREFA`).
- Não mexer em check-ins proativos planejados, pergunta semanal, cápsula do tempo ou relatórios.
- Não reescrever o tom geral da Aura neste passo.