

# Análise dos Problemas na Conversa da AURA com Clara

## Problemas Identificados

### 1. Spam de mensagens automáticas (session-reminder)
Em 11/03, após Clara dizer "vamos agendar" às 11:28, a AURA entrou numa sessão que ficou sem resposta. O sistema disparou **4 mensagens automáticas consecutivas** em poucos minutos:
- 11:35 — "E aí, sumiu no meio do rolê?"
- 11:45 — "Chegou a ver o horário?"
- 11:50 — "Ei, tudo bem? Tá quietinho aí..."
- 12:00 — "Ei, a gente tava falando da nossa sessão, né?"

Clara estava na academia e avisou que demoraria. O sistema ignorou isso. A própria Clara mencionou: *"Me desculpa por ter te apressado antes, meu sistema deu uma bugada e eu te enchi de notificação"* — a AURA reconheceu o bug na resposta.

### 2. AURA ecoou a mensagem da usuária
Clara enviou: *"Não tem como isso ser positivo"*
A AURA respondeu com o **texto idêntico** da Clara: *"Não tem como isso ser positivo."*
Clara reclamou: *"Você só mandou o que eu mesma mandei"* e perguntou *"É bug de novo?"*

Isso indica um problema no `aura-agent` onde, em algum caso, o conteúdo da mensagem do usuário é retornado como resposta.

### 3. Erro "Phone is empty" no session-reminder
Os logs mostram que o `session-reminder` está tentando enviar post-session summary para a sessão `046077f6` mas falha com `"Phone is empty"`. Isso pode indicar que:
- A sessão pertence a um usuário sem telefone cadastrado
- Ou o código não está buscando o phone corretamente do perfil

### 4. Sessão marcada como no_show indevidamente
A sessão `30643671` (agendada para 27/02 às 23:30) foi iniciada em 11/03 às 11:28 e encerrada como `no_show` com summary "Usuário não participou ativamente". Mas Clara **estava conversando** — ela disse "vamos agendar" e a AURA respondeu. O sistema parece ter considerado no_show por falta de resposta subsequente, mas ela estava na academia.

### 5. Follow-up insistente em contexto emocional delicado
O contexto da conversa registra: *"TOM: frustrado e irritadiço"*. Mesmo assim, o sistema enviou follow-up em 12/03 às 11:00: *"E aí, já deu uma olhada na sessão de hoje?"* — tom casual inadequado para o estado emocional registrado.

## Recomendações de Correção

### A. Corrigir echo de mensagens no aura-agent
Investigar o `aura-agent/index.ts` para encontrar o caso onde a resposta da IA replica o texto do usuário. Provável problema na construção do prompt ou no fallback de resposta.

### B. Limitar mensagens automáticas do session-reminder
Adicionar lógica para:
- Não enviar mais de 2 lembretes sem resposta do usuário
- Respeitar quando o usuário avisa que vai demorar
- Aumentar o intervalo entre lembretes

### C. Corrigir "Phone is empty" no session-reminder
Verificar a query que busca o telefone do usuário na função `session-reminder` — provavelmente não está fazendo join com a tabela `profiles` corretamente.

### D. Ajustar tom dos follow-ups baseado no contexto emocional
O `conversation_context` já registra o tom. Usar essa informação para adaptar ou suprimir follow-ups quando o tom indica frustração.

---

Quer que eu investigue e corrija algum desses problemas específicos? Posso começar pelo mais crítico (echo de mensagens ou spam de lembretes).

