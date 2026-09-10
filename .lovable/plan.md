# O encontro de R$ 6,90 precisa aparecer quando o lead pede exatamente isso

Conferi a conversa da Maria (10/09, 12:20–12:28) e o motivo do erro está claro. Ela disse, nessa ordem: "Pix normal pode", "Não deu certo", "Quero pagar só R$ 6,90", "Lá me cobrou mais de R$ 29,00", "Quero pagar só a de hoje. Vou usar uma semana. Se ver que gostei, renovo."

É o pedido exato do encontro avulso de R$ 6,90 — e o agente respondeu quatro vezes explicando PIX Automático e a "1ª semana do plano". Em todas as quatro respostas o marcador da oferta ficou desligado (`offerTaster: false`), então nenhum código de R$ 6,90 foi gerado.

## Por que não saiu

1. **Ela era elegível e o agente não usou.** O checkout dela é PIX Automático com o código copiado às 12:24, não é cliente e nunca pagou nada — ou seja, o backend liberava a oferta. A decisão de oferecer ficava 100% nas mãos do modelo, e o modelo não reconheceu o pedido.
2. **Não existe gatilho automático para o pedido.** O reconhecimento direto só cobre frases como "quero sessão avulsa"/"quero experimentar", ou um "quero" solto **depois** de a oferta já ter saído. "Pix normal pode", "quero pagar só R$ 6,90", "pagar só a de hoje", "não quero deixar autorizado" não acionam nada.
3. **A base de conhecimento só conhece um R$ 6,90 — o errado.** Todas as 7 respostas da base que citam R$ 6,90 descrevem a 1ª semana do plano com autorização no banco. Não existe nenhuma resposta sobre o encontro avulso de 45 minutos. Perguntada sobre R$ 6,90, a base sempre devolve "primeira semana da assinatura" — foi literalmente o que ela recebeu.
4. **Nada barra a confusão.** O agente chamou o pagamento único de "primeira semana", exatamente o que a instrução interna proíbe, e nenhuma checagem pegou isso antes de enviar.

## O que fazer

1. **Gatilho automático de "só uma vez, sem autorizar".** Frases como "pix normal", "sem autorizar", "não quero autorização", "só R$ 6,90", "pagar só hoje/só essa/uma vez", "só quero testar/experimentar antes", "não quero mensalidade" passam a marcar o pedido. Quando o lead é elegível, a oferta do encontro de 45 minutos por R$ 6,90 passa a ser **obrigatória** naquela mensagem, e não uma opção do modelo.
2. **Aceite gera o código na hora.** Se o pedido é explícito o suficiente ("quero pagar só os 6,90", "quero a de hoje"), o agente gera e manda o código de R$ 6,90 direto, sem mais uma rodada de conversa.
3. **Duas respostas novas na base de conhecimento**, deixando os dois R$ 6,90 separados: o encontro guiado avulso (pagamento único, PIX comum, sem autorizar nada, 48h pra marcar) e a 1ª semana do plano (assinatura com autorização). Assim a base para de responder "primeira semana" a quem quer o encontro.
4. **Trava antes de enviar:** mensagem que fala de R$ 6,90 e chama isso de "semana", "plano", "assinatura", "7 dias" ou "mensalidade" é reescrita uma vez antes de sair.
5. **Responder a Maria** com a mensagem certa, gerando o código de R$ 6,90 — depois de conferir a prévia.

## Detalhes técnicos

- `recovery-agent/pix-buttons.ts`: novo `RE_SINGLE_NO_MANDATE` e `classifyTasterIntent` passa a devolver `"single_request"`; `handleTasterAccept` reaproveitado para gerar o código.
- `recovery-agent/index.ts`:
  - o bloco determinístico (~linha 627) aceita `single_request` sem exigir `tasterOfferAlreadySent`;
  - `tasterInstruction` ganha variante MANDATÓRIA quando o gatilho aparece na mensagem atual ou nos inbounds não respondidos;
  - `offerTaster` é forçado quando o gatilho existe, o lead é elegível e o modelo não emitiu o marcador;
  - nova guarda `RE_TASTER_CONFUSION` (6,90 + semana/plano/assinatura/7 dias/mensalidade) com uma regeneração corretiva.
- `recovery_knowledge_base`: 2 linhas novas (`category: 'pagamento'` e `'objecao'`) com palavras-chave "avulso, sessão única, sem autorizar, pix normal, só 6,90".
- Publicar `recovery-agent` e validar com `preview: true` na conversa da Maria antes de qualquer envio real.
