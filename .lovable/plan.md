

# Garantir Resposta da Aura — Sem Fallbacks

## Problema Confirmado

Dados do banco mostram o padrão: worker inicia (`response_started_at` atualizado), mas NENHUMA mensagem assistente é salva. Casos confirmados:
- **Juliane**: "Oi amiga" (20:22) → 0 respostas por ~4h
- **Juliane**: "Deixa eu te falar..." (00:14) → 0 respostas
- **Michele**: "To com saudade dele" (21:07) → 0 respostas
- **Débora**: "nao sei" (21:11) → 0 respostas

## Causa Raiz

O `aura-agent` usa Gemini 2.5 Pro com histórico longo + múltiplas verificações (anti-echo, anti-repetição, análise pós-conversa). Se a chamada **timeout** (edge function morre) ou retorna **mensagens vazias** (stripped por tags), o `process-webhook-message`:
1. NÃO tenta de novo
2. O contingency só dispara no `catch` — se o fetch simplesmente demora demais, a função morre antes de chegar lá
3. A mensagem do usuário já foi persistida mas nunca recebe resposta

## Solução: Retry com Timeout Controlado (Sem Fallback)

### Correção 1: Timeout + Retry no fetch ao aura-agent
**Arquivo**: `process-webhook-message/index.ts`, linhas 680-706

Em vez de um fetch sem timeout que pode morrer silenciosamente:
- Adicionar `AbortController` com **50s** de timeout
- Se timeout OU HTTP error: **retry 1x** com os mesmos parâmetros
- Se o retry também falhar: **retry 1x mais** com flag `minimal_context: true` (pede ao agent para usar menos histórico, mais rápido)
- Só após 3 tentativas falharem: logar erro crítico e liberar lock (sem mandar mensagem de fallback)

### Correção 2: Guard contra mensagens vazias após strip
**Arquivo**: `process-webhook-message/index.ts`, após linha 857

Após o loop de envio de mensagens, se `!sentAnyResponse && !wasInterrupted`:
- **Retry o aura-agent 1x** (não enviar fallback)
- Enviar o resultado do retry normalmente
- Se o retry também retornar vazio: logar alerta crítico mas NÃO enviar fallback genérico

### Correção 3: Remover mensagem de contingência
**Arquivo**: `process-webhook-message/index.ts`, linhas 908-923

Remover completamente o bloco que envia "Tive um probleminha técnico". Se após todos os retries não houver resposta, o sistema simplesmente libera o lock e loga — o `conversation-followup` CRON (que já existe) vai detectar que o usuário ficou sem resposta e fazer follow-up natural.

### Correção 4: Persistir mensagem ANTES do lock
**Arquivo**: `process-webhook-message/index.ts`, linhas 384-419

Mover a persistência da mensagem do usuário para ANTES da aquisição do lock (antes da linha 324). Se o worker concorrente vence, a mensagem já está salva e será acumulada pelo worker principal. Hoje, se o worker é debounced na linha 347, a mensagem some.

## Resultado Esperado

- **3 tentativas** antes de desistir (50s + 50s + 50s com contexto mínimo)
- **Zero mensagens genéricas** tipo "probleminha técnico"
- **Zero mensagens perdidas** — persistência antes do lock
- Follow-up natural pelo CRON se tudo falhar (já implementado)

