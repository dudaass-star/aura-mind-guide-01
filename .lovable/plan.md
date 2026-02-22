

# Reestruturacao do Prompt para Cache Implicito do Gemini

## Resumo

Separar o prompt atual (1 mensagem de sistema com tudo junto) em 2 mensagens de sistema: uma estatica (cacheavel) e uma dinamica (muda a cada chamada). O conteudo que chega ao modelo sera identico, apenas reorganizado.

## Mudancas no arquivo `supabase/functions/aura-agent/index.ts`

### 1. Limpar placeholders do AURA_SYSTEM_PROMPT (linhas 194-1158)

Remover os 15 placeholders dinamicos e tornar o template puramente estatico:

**Secao "CONTEXTO TEMPORAL" (linhas 996-1006):** Remover os valores `{current_date}`, `{current_time}`, `{current_weekday}` e substituir por instrucao generica: "Consulte o bloco DADOS DINAMICOS DO SISTEMA fornecido separadamente."

**Secao "CONTEXTO DO USUARIO" (linhas 1125-1133):** Remover `{user_name}`, `{user_plan}`, `{sessions_available}`, `{messages_today}`, `{last_checkin}`, `{pending_commitments}`, `{message_count}`, `{session_active}` e substituir por instrucao: "Consulte o bloco DADOS DINAMICOS DO SISTEMA."

**Secao "MEMORIA DE LONGO PRAZO" (linha 1148):** Remover `{user_insights}` e substituir por referencia ao bloco dinamico.

**Secao "JORNADAS" (linhas 1035-1036):** Remover `{current_journey}`, `{current_episode}`, `{total_episodes}`.

**Secao "AUDIO" (linha 1157):** Remover `{audio_session_context}`.

**Referencia a `{current_date}` na secao de agendamento (linha 1084):** Substituir por "a data atual fornecida no bloco dinamico".

Renomear a variavel de `AURA_SYSTEM_PROMPT` para `AURA_STATIC_INSTRUCTIONS`.

### 2. Criar bloco de contexto dinamico (novo codigo, apos linha 3089)

Substituir o bloco `.replace()` (linhas 3072-3089) por construcao de uma string `dynamicContext`:

```typescript
const dynamicContext = `# DADOS DINAMICOS DO SISTEMA

## Contexto Temporal
- Data de hoje: ${dateTimeContext.currentDate}
- Hora atual: ${dateTimeContext.currentTime}
- Dia da semana: ${dateTimeContext.currentWeekday}

## Dados do Usuario
- Nome: ${profile?.name || 'Ainda nao sei o nome'}
- Plano: ${userPlan}
- Sessoes disponiveis este mes: ${sessionsAvailable}
- Mensagens hoje: ${messagesToday}
- Ultimo check-in: ${lastCheckin}
- Compromissos pendentes: ${pendingCommitments}
- Historico de conversas: ${messageCount} mensagens
- Em sessao especial: ${sessionActive ? 'Sim - MODO SESSAO ATIVO' : 'Nao'}

## Jornada de Conteudo
- Jornada atual: ${currentJourneyInfo}
- Episodio atual: ${currentEpisodeInfo}/${totalEpisodesInfo}

## Regra de Audio
${audioSessionContext}

## Memoria de Longo Prazo
${formatInsightsForContext(userInsights)}
`;
```

### 3. Mover contextos condicionais para o dynamicContext

Todos os blocos que hoje sao concatenados ao `finalPrompt` passam a ser concatenados ao `dynamicContext`:

- `continuityContext` (sessoes anteriores, onboarding, temas, compromissos)
- Trial gratuito
- Gap temporal
- Agenda/sessoes
- Controle de fase de sessao
- Contexto de interrupcao
- Instrucoes de upgrade
- Configuracao de agenda mensal
- Instrucao de encerramento

Basicamente: onde hoje diz `finalPrompt += ...`, passa a dizer `dynamicContext += ...`.

### 4. Alterar estrutura de mensagens da API (linhas 3468-3472)

De:
```typescript
const apiMessages = [
  { role: "system", content: finalPrompt },
  ...messageHistory,
  { role: "user", content: message }
];
```

Para:
```typescript
const apiMessages = [
  { role: "system", content: AURA_STATIC_INSTRUCTIONS },
  { role: "system", content: dynamicContext },
  ...messageHistory,
  { role: "user", content: message }
];
```

### 5. Remover variaveis obsoletas

- Remover `contextualPrompt` (nao existe mais, o template nao tem `.replace()`)
- Remover `finalPrompt` (substituido por `dynamicContext` para a parte variavel)

## O que NAO muda

- Nenhuma query ao banco
- Nenhuma logica de negocio
- Nenhum post-processamento de tags
- Nenhuma funcao auxiliar
- O conteudo total que o modelo recebe e identico

## Resultado esperado

- ~14.000 tokens estaticos cacheados pelo Gemini (75% desconto)
- Economia estimada de ~44% no custo de input
- Comportamento da Aura 100% identico

