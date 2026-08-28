# O que aconteceu com as mensagens no seu WhatsApp

Foi um teste meu que virou envio real. Não foi o sistema disparando sozinho para leads.

## O que os dados mostram

Na inbox de recuperação existe uma conversa criada hoje 28/08 às 11:57 BRT para o seu número, com exatamente duas mensagens:

- 11:57 — "Oi! Você acessa seu espaço por aqui: olaaura.com.br/meu-espaco…"
- 11:58 — "De nada, Eduardo! Se precisar de algo mais é só chamar por aqui."

Ambas estão marcadas como `bot: true`, com SID real da Twilio (foram aceitas pela API, ou seja: envio real, não simulação). E o campo de última mensagem recebida do lead está **vazio** — nunca houve mensagem sua. Ou seja, o agente respondeu a uma mensagem inventada pelo teste de validação que rodei na etapa anterior, e essa "resposta" saiu de verdade pela subconta Twilio de recuperação.

Por isso o quadro estranho: aparece conversa no admin, mas você não recebeu nada no WhatsApp da Aura — o remetente foi o número de recuperação, e não há confirmação de entrega registrada em lugar nenhum.

## O que corrigir

1. **Teste nunca mais envia de verdade.** O agente de recuperação passa a aceitar um modo de simulação: gera a resposta, grava o que enviaria, mas não chama a Twilio. Toda validação futura usa esse modo.
2. **Sem inbound real, não sai mensagem.** Antes de enviar, o agente confere se existe mensagem recebida de fato daquele telefone. Se não existir, ele para — assim nenhuma invocação manual ou repique de cron consegue gerar conversa fantasma.
3. **Limpar esta conversa de teste** para ela sair da inbox e não contaminar as métricas de resposta (277 conversas / 66 respondidas).
4. **Confirmar o destino das duas mensagens** consultando o status final na Twilio (entregue, falhou ou parada), para saber se elas chegaram a algum aparelho.

## Detalhes técnicos

- `supabase/functions/recovery-agent/index.ts`: novo parâmetro `dry_run` (não envia, não grava outbound, não incrementa `auto_reply_count`); guard novo que exige pelo menos um `recovery_messages.direction='in'` para o telefone antes de qualquer envio automático.
- Limpeza: remover as 2 linhas de `recovery_messages` e a linha de `recovery_conversations` do telefone de teste (migração pontual, sem mudança de schema).
- Verificação de entrega: leitura dos SIDs `SM4c07a4af…` e `SM3c9e1da0…` via `getRecoveryMessage` em `_shared/twilio-recovery-client.ts` (somente leitura).
- Nenhuma alteração no fluxo de leads reais, na fila noturna nem no modo suporte.
