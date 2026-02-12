
## Implementacao: Follow-up Contextual Inteligente + Session-Reminder Fallback

### 1. Conversation-Followup: Contexto Inteligente

**Arquivo:** `supabase/functions/conversation-followup/index.ts`

#### Mudanca A - `extractConversationTheme` vira `extractConversationContext` (linhas 117-175)

Substituir a funcao atual que extrai apenas um tema curto (50 chars) por uma que extrai contexto completo:
- Aumentar janela: 20 mensagens (era 10), 300 chars por mensagem (era 150)
- Novo prompt pede formato estruturado: `TEMA: [tema] | TOM: [tom emocional] | CUIDADO: [consideracoes]`
- `max_tokens`: 150 (era 60), aceitar ate 300 chars (era 100)
- Modelo: `google/gemini-2.5-flash` (mantido)

Exemplos no prompt:
- `"TEMA: Rotina matinal e caminhada | TOM: leve e motivado | CUIDADO: nenhum"`
- `"TEMA: Ideacao suicida, sacada | TOM: crise emocional grave | CUIDADO: nao enviar follow-up casual, apenas check-in cuidadoso"`
- `"TEMA: Briga com mae | TOM: triste e frustrada | CUIDADO: acolher sem pressionar"`

#### Mudanca B - `generateContextualFollowup` usa contexto completo (linhas 191-298)

- Renomear parametro `conversationTheme` para `conversationContext`
- No prompt de geracao (linha 246), passar o contexto completo em vez de apenas o tema
- Adicionar instrucao: "Se o contexto indicar situacao muito sensivel ou que o usuario precisa de espaco, retorne exatamente SKIP"
- A IA adapta o tom automaticamente com base no contexto

#### Mudanca C - Tratar resposta "SKIP" no loop principal (apos linha 517)

Apos receber a mensagem gerada:
- Se `message === 'SKIP'` ou `message.trim().toUpperCase() === 'SKIP'`: logar motivo e `continue` (nao enviar)
- Adicionar contador `skippedByContext` no resultado

#### Mudanca D - Atualizar referencias

- Todas as variaveis `conversationTheme` renomeadas para `conversationContext`
- `extractConversationTheme` -> `extractConversationContext`
- Log e salvamento no campo `conversation_context` continua funcionando igual

### 2. Session-Reminder: Fallback para Completed

**Arquivo:** `supabase/functions/session-reminder/index.ts`

#### Mudanca E - Bloco else (linhas 521-532)

Dividir o caso atual (tudo vira `no_show`) em dois:

```text
if userMsgsInSession >= 5:
  statusToSet = 'completed'
  summaryToSet = await generateSessionSummaryFallback(supabase, session)
  messageToSend = mensagem reconhecendo que a sessao aconteceu
else (2-4 mensagens):
  statusToSet = 'no_show' (manter comportamento atual)
  summaryToSet = 'Sessao encerrada automaticamente...'
  messageToSend = mensagem atual
```

#### Mudanca F - Nova funcao `generateSessionSummaryFallback()`

Adicionar antes do `Deno.serve`:
- Buscar mensagens da sessao (entre `session.started_at` e agora)
- Chamar Lovable AI gateway (`google/gemini-2.5-flash`) com prompt para gerar:
  - Summary da sessao
  - Key insights
  - Commitments (se houver)
- Salvar no registro da sessao
- Fallback estatico se a IA falhar

### 3. Correcao SQL da sessao do Lucas

Executar via migration tool:
- `UPDATE sessions SET status = 'completed' WHERE id = 'fc82f4c4-...'` (preciso confirmar o ID completo)

### Re-deploy

Duas funcoes serao redeployadas automaticamente: `conversation-followup` e `session-reminder`

### Resultado Esperado

- Follow-ups sempre consideram contexto emocional completo (tema + tom + cuidados)
- Situacoes sensiveis recebem follow-up adequado ou nenhum follow-up (SKIP)
- Sessoes com 5+ mensagens do usuario nunca mais sao marcadas como `no_show`
- Dados de sessoes abandonadas com participacao ativa sao preservados via summary gerado por IA
