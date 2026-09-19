# Respeitar “não envie áudio” sem exceções acidentais

## Diagnóstico confirmado

O problema da Bruna foi real e a causa principal está comprovada no código e nos dados:

- Ela pediu texto de várias formas: “Pode responder com mensagens?”, “Prefiro ler”, “Eu pedi pra conversar por mensagens”, “Não quero ouvir áudio”, “Mensagem” e “Não mande áudio”.
- Nenhuma dessas formas foi reconhecida pelos detectores atuais. Eles procuram frases mais rígidas, como “não manda áudio”, “sem áudio” e “só texto”. Por isso o perfil dela permaneceu em `voice_mode = auto`, sem data de preferência.
- Sem o bloqueio registrado, a sessão continuou liberando áudio por abertura, decisão espontânea da IA e fechamento. O último caso é inequívoco: após “Não mande áudio”, a resposta dizia “Pode deixar, sem áudio”, mas foi enviada em áudio.
- O prompt já orienta a não usar áudio quando a pessoa pede texto, mas isso não basta: o modelo entendeu semanticamente alguns pedidos e mesmo assim voltou a marcar áudio depois.
- A regra está duplicada e divergente em dois pontos do sistema. Uma frase pode ser reconhecida antes do atendimento e não dentro do agente, ou o contrário.
- A etapa final de envio confia na marcação recebida e não verifica novamente a preferência mais recente. Assim, uma decisão antiga pode seguir para áudio mesmo se uma nova mensagem de recusa chegar durante o processamento.
- Há dois caminhos paralelos que também precisam ser fechados: o piloto que espelha áudio e o envio de meditações gravadas não consultam de forma completa a preferência por texto.

## Implementação

1. **Criar uma única interpretação determinística de canal**
   - Centralizar a detecção usada pelo recebimento e pelo agente.
   - Normalizar acentos, pontuação, flexões e linguagem natural.
   - Cobrir pedidos afirmativos e negativos reais, incluindo “mensagem”, “prefiro ler”, “não quero ouvir”, “não mande”, “para com áudio” e equivalentes.
   - Evitar falsos positivos quando a pessoa apenas menciona voz/áudio no assunto da conversa.
   - Quando houver conflito na mesma mensagem, a instrução explícita mais recente vence.

2. **Transformar o pedido de texto em bloqueio real de áudio**
   - Persistir imediatamente a preferência antes de qualquer outro tratamento.
   - Manter `texto` até a pessoa pedir áudio novamente, sem expirar silenciosamente em sete dias.
   - Fazer o pedido de texto prevalecer sobre abertura, fechamento, crise emocional, decisão da IA e espelhamento de áudio.
   - Em risco de vida, continuar o protocolo de segurança por texto; não usar áudio contra a vontade declarada.

3. **Aplicar uma trava final antes de cada envio**
   - Reconsultar a preferência atual imediatamente antes de gerar ou enviar TTS.
   - Se a pessoa tiver mudado para texto enquanto a resposta era preparada, converter qualquer bolha de áudio pendente para texto.
   - Não salvar conteúdo de áudio interrompido para envio posterior.
   - Aplicar a mesma trava a meditações gravadas; só enviá-las quando houver pedido/aceite explícito compatível.

4. **Alinhar o prompt sem depender dele para segurança**
   - Informar claramente que uma preferência textual vigente proíbe `[MODO_AUDIO]`.
   - Remover instruções conflitantes que tratam áudio de abertura ou fechamento como obrigatório.
   - Manter a decisão determinística no sistema como autoridade final.

5. **Criar testes de regressão baseados no caso real**
   - Testar todas as frases usadas pela Bruna e variações com/sem acento.
   - Simular abertura, conteúdo emocional, fechamento, áudio enviado pelo usuário, meditação e mensagem nova chegando durante a geração.
   - Garantir o inverso: “quero áudio” continua funcionando e revoga conscientemente a preferência de texto.
   - Garantir que menções como “a voz dele é alta” não sejam confundidas com preferência de canal.

6. **Publicar e validar no fluxo real**
   - Publicar conjuntamente o recebimento, o agente e o envio de meditação para não haver regras desencontradas.
   - Executar testes dirigidos no ambiente publicado e confirmar que nenhuma resposta sai em áudio após cada formulação de recusa.
   - Conferir os registros de falha e decisões de envio após a publicação para descartar diferença entre código e produção.

## Resultado esperado

Depois de qualquer pedido claro para não receber áudio, toda resposta seguinte será enviada por texto até um novo pedido explícito de áudio. A regra valerá em sessões, crises, fechamentos, respostas demoradas, mensagens concorrentes e meditações.
