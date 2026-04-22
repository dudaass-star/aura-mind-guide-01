

## Como mandar a mensagem pro Thiago

### Estado da janela (verificado agora)

- Última mensagem do Thiago: **22/abr 09:11 BRT** (~4h35min atrás)
- Janela 24h: **ABERTA** até ~23/abr 09:11 BRT
- Caminho: **texto livre via `sendFreeText`** (gratuito, sem template, entrega imediata)

### Por que texto livre e não template

A função `sendProactive` já decide isso automaticamente:
1. Se `last_user_message_at` < 24h → manda **texto livre** (`sendFreeText`)
2. Se > 24h → manda **template aprovado** (ContentSid)

Como ele mandou mensagem hoje de manhã, a janela está aberta. Se eu demorar e passar das 09:11 de amanhã, o `sendProactive` faz fallback automático pro template `cheking_7dias` (único de check-in proativo aprovado) — mas aí a mensagem vira o texto fixo do template, sem personalização rica.

**Conclusão: vou rodar agora, dentro da janela, com texto livre.**

### Conteúdo proposto (informal, sem mencionar pagamento — porque não houve problema)

> Oi Thiago, aqui é a Aura. Tive uma falha técnica do meu lado entre ontem e hoje e suas mensagens não chegaram pra mim do jeito certo — por isso o silêncio. Já tá resolvido. Me desculpa pela demora, sei que você tava esperando resposta. Tô aqui agora, pode mandar.

Mensagem curta, honesta, sem desculpa exagerada, sem oferecer compensação (você decide se quer somar isso depois).

### Execução técnica

1. Chamar a edge function `send-zapi-message` (ou `sendProactive` direto via invoke) com:
   - `user_id`: `b05f509a-1a17-4364-b454-22ae21cfa137`
   - `phone`: `553183774774`
   - `text`: mensagem acima
2. Confirmar HTTP 200 + `messageId` retornado pelo Twilio
3. Verificar nos logs do `process-webhook-message` se ele responder

### Plano B se passar das 09:11 de amanhã sem ação

- `sendProactive` cai automaticamente no template `cheking_7dias` (HX4e299f6168e7d4ac4159c14ed470fca6, categoria `checkin`, único proativo aprovado)
- Esse template tem botão de Quick Reply — quando ele clicar, abre a janela de 24h e aí mandamos o texto rico de desculpa
- Ou seja: nunca fica sem caminho de entrega, só perde a riqueza do texto direto

### Decisões pendentes pra você

- **Texto da mensagem**: aprovar a versão acima, ou ajustar tom/conteúdo?
- **Compensação**: mandar só desculpa, ou já incluir oferta (1 mês grátis / crédito)?

