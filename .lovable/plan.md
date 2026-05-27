# Retomada contextual para os 30 usuários sem resposta

## Objetivo

Para cada um dos 30 usuários cuja última mensagem ficou pendurada por causa do bug do Meta (131037), a Aura envia **uma mensagem só**, escrita sob medida, que:

1. Reconhece de forma breve e honesta a instabilidade (sem se desculpar de joelhos, no tom dela).
2. **Referencia o conteúdo concreto da última mensagem do usuário** — mostra que leu, que não está começando do zero.
3. Devolve a bola de um jeito que continua o fio (não um "como você tá?" genérico).

Sem reenviar respostas antigas descontextualizadas. Sem disparar pra quem já voltou a conversar sozinho depois do fix.

## Passo a passo

### 1. Montar a lista final de destinatários
- Pegar os 30 user_ids de `failed_message_log` (últimas ~24h, error 131037, resolved=false).
- **Filtrar fora** quem já recebeu resposta da Aura *depois* do fix (ou seja, já tem `messages` com `role='assistant'` posterior ao último `failed_message_log`) — esses já foram atendidos organicamente.
- Para cada user_id restante: buscar a **última mensagem do usuário** (`messages` onde `role='user'`, ordem desc, limit 1) + nome do perfil + janela 24h aberta sim/não.

### 2. Gerar a mensagem de retomada (uma por usuário, via LLM)
Chamada única ao `aura-agent` (ou um endpoint enxuto novo `recover-stuck-users`) com prompt curto e específico:

> "A última mensagem que [NOME] te mandou foi: '[ÚLTIMA_MSG]'. Você não respondeu por uma instabilidade técnica que durou algumas horas. Escreva UMA mensagem de retomada (max 3 bubbles, separadas por |||) que: (1) reconheça brevemente a falha sem dramatizar, (2) mostre que você leu o que ela disse, referenciando o conteúdo, (3) continue o fio de forma natural — sem 'como você tá?' genérico. Tom Aura padrão (informal PT-BR, presente, honesto)."

Modelo: `google/gemini-2.5-flash` (basta, não precisa Pro pra isso).

### 3. Envio
- Rota: `sendProactive()` → cai em `whatsapp-official.ts` (Twilio), já funcionando.
- Janela 24h aberta (todos esses usuários mandaram msg recente) → texto livre direto, sem template, sem custo de conversation.
- Respeitar quiet hours 22h–08h BRT: se rodar fora do horário, agendar pra 08h.
- Gravar cada bubble em `messages` com `role='assistant'` (pra Aura ter contexto da retomada na próxima troca).
- Marcar os `failed_message_log` correspondentes como `resolved=true`.

### 4. Log & verificação
- Tabela `failed_message_log` com `function_name='recover-stuck-users'` se algum falhar.
- Print no console: total enviados / pulados (já respondidos) / falhados.

## Detalhes técnicos

- **Edge function nova**: `supabase/functions/recover-stuck-users/index.ts`, invocada uma vez manualmente (sem cron).
- Roda sequencial com ~1.5s de delay entre usuários (segurança Twilio + parecer humano).
- Sem alteração em `system_config`, sem alteração de prompt da Aura, sem mudança no agente principal.

## O que não vou fazer

- Não vou disparar template — todos estão dentro da janela 24h.
- Não vou reenviar o conteúdo original perdido da Aura (era resposta a um ponto específico que pode estar defasado).
- Não vou tocar nos ~30 outros usuários que já voltaram a conversar e foram atendidos.
- Não vou criar UI no admin pra isso — é um one-shot.

## Pergunta de confirmação antes de implementar

Quer revisar a mensagem de **1 usuário-exemplo** (gerada pelo LLM) antes de eu disparar pros 30, ou pode mandar direto pra todos?
