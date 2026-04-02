

## Diagnóstico: Falhas no Envio de Boas-Vindas

### O que encontrei

**Dados de hoje (3 novos clientes):**

| Nome | Telefone | Criado via | Msgs no DB | Welcome recebida? |
|------|----------|------------|------------|-------------------|
| Jessica Gonçalves | 5519971649419 | stripe-webhook | 1 (welcome) | Sim |
| Julianna Vargas | 5562993355019 | stripe-webhook | 1 (welcome) | Sim |
| ANDERCLEY CAPELLI | 5527992357957 | stripe-webhook | **0** | **Nao** |

### Problema 1 (CRITICO): Welcome do Andercley falhou silenciosamente

O Andercley completou o checkout às 18:59, o perfil foi criado corretamente (status `trial`, plano `essencial`), mas **zero mensagens** foram registradas. O `sendProactive` falhou sem registro.

Sem logs disponíveis do stripe-webhook (retenção expirada), não é possível confirmar a causa exata. Possíveis causas:
- Timeout ou erro transitório no Twilio Gateway no momento do envio
- Erro silencioso capturado pelo `try/catch` que apenas loga e segue

### Problema 2 (BUG): stripe-webhook nao salva welcome na tabela `messages`

O `start-trial` faz:
```
await supabase.from('messages').insert({ user_id, role: 'assistant', content: welcomeMessage });
```

Mas o `stripe-webhook` (linhas 308-317) **apenas envia via WhatsApp sem persistir no banco**. Isso causa:
- Welcome invisível no painel admin
- Contexto da conversa incompleto para o agente (nao sabe que ja mandou welcome)
- Historico perdido

Para Jessica e Julianna, as messages apareceram porque provavelmente o webhook-twilio recebeu um delivery status que não é um insert de mensagem — na verdade, revisando: elas TEM 1 mensagem de welcome no banco. Isso sugere que talvez o fluxo delas passou por um caminho diferente que faz insert, ou o start-trial foi chamado antes.

### Problema 3 (MENOR): Instancia WhatsApp `null` para todos os novos usuarios

A unica instancia WhatsApp (`Aura #1`) está com status `disconnected`. O `allocateInstance` retorna `null`. Isso nao afeta o envio via API Oficial (Twilio), mas deixa o campo `whatsapp_instance_id` vazio nos perfis.

### Plano de Correção

**Arquivo: `supabase/functions/stripe-webhook/index.ts`**

1. **Adicionar persistencia da welcome message na tabela `messages`** apos o envio bem-sucedido via `sendProactive` — mesma logica que o `start-trial` ja faz. Aplicar em TODOS os pontos de envio de welcome:
   - Trial validation welcome (linha ~309)
   - Normal checkout welcome (linha ~517)  
   - Welcome back apos reativacao (linha ~672)

2. **Adicionar retry simples** para o envio da welcome: se `sendProactive` falhar, aguardar 3s e tentar novamente uma vez antes de desistir. A welcome é a mensagem mais critica do sistema.

**Escopo:** Apenas o arquivo `stripe-webhook/index.ts` precisa ser alterado. Nenhuma migration necessária.

### Ação imediata para o Andercley

Após o deploy, enviar manualmente a welcome para o Andercley via admin (telefone `5527992357957`) para que ele não fique sem atendimento.

