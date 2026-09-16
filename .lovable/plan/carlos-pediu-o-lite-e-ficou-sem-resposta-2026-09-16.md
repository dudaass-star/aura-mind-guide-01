# Carlos pediu o Lite e ficou sem resposta

## O que aconteceu

- Carlos pagou a semana inicial de **R$ 6,90 em 16/08**.
- Ele experimentou de verdade: usou **1 sessão**, acumulou **323 interações registradas no período de teste** e possui **1.245 mensagens** no histórico.
- A assinatura não continuou: o PIX Automático ficou sem autorização válida e o perfil terminou cancelado.
- Em **10/09**, Carlos recebeu e leu a oferta do **plano Lite**.
- Em **15/09 às 21h19 BRT**, respondeu **“Quero o Life”** — pelo contexto, uma grafia de “Quero o Lite”.

Portanto, **não devemos oferecer o encontro avulso de R$ 6,90 novamente**. A trava atual de ex-cliente está correta neste caso; Carlos já experimentou e agora deve seguir para o Lite.

## Por que o agente não respondeu

Em agosto, quando Carlos explicou que não queria avançar por causa dos R$ 29,90, a expressão **“não quero”** acionou uma regra ampla de interrupção. A conversa ficou marcada permanentemente como se ele tivesse pedido para não receber mais mensagens.

Quando ele voltou agora pedindo o Lite, o agente encontrou essa marca antiga e encerrou o atendimento antes de interpretar a nova mensagem. Assim, um bloqueio criado para respeitar pedidos de parada também bloqueou uma intenção comercial explícita posterior.

Há ainda várias grafias do telefone de Carlos no histórico, mas o pedido do Lite e a pausa estão na mesma grafia. Portanto, a fragmentação do número não foi a causa direta deste silêncio.

## Correção

1. **Reconhecer o aceite do Lite de forma determinística**
   - “Quero o Lite”, “Quero o Life” e variações claras passam a ser reconhecidas quando existe oferta Lite recente entregue ao mesmo telefone.
   - O contexto da oferta recente decide a intenção; “Life” isolado não vira regra global.

2. **Aceite de oferta supera recusa antiga**
   - Um pedido explícito por Lite, desconto ou retomada de assinatura reabre a conversa mesmo que exista uma pausa antiga criada por “não quero”.
   - Pedidos reais de descadastro, parada de mensagens ou atendimento humano continuam sendo respeitados.

3. **Corrigir a origem da pausa indevida**
   - “Não quero” deixa de ser tratado sozinho como pedido permanente de silêncio.
   - Só frases que claramente pedem interrupção de contato mantêm a pausa definitiva.
   - Recusar preço, autorização, plano ou condição comercial encerra apenas aquele argumento, sem impedir uma escolha futura.

4. **Concluir o caso do Carlos pelo Lite**
   - Gerar uma prévia da resposta com a oferta Lite já prometida e o caminho correto de reativação.
   - Após validar a prévia, enviar a resposta e confirmar entrega.
   - Não oferecer nem gerar nova sessão avulsa de R$ 6,90.

## Detalhes técnicos

- Ajustar a classificação de parada em `recovery-agent/index.ts`, separando opt-out real de objeção comercial.
- Adicionar fast-path de aceite de retenção baseado no último `dunning_attempts.offer_tier = 'lite'` entregue e na mensagem atual.
- Reaproveitar o token de acesso para devolver o link `https://olaaura.com.br/cancelar?t=<token>&offer=lite`; o próprio fluxo existente cria a reativação no Lite.
- Limpar apenas a pausa indevida da conversa do Carlos ao executar o aceite; nenhuma mudança na elegibilidade do encontro avulso.
- Adicionar testes para:
  - “não quero autorizar R$ 29,90” não virar opt-out permanente;
  - “pare de me mandar mensagem” continuar bloqueando;
  - “Quero o Lite” e “Quero o Life” após oferta Lite seguirem para reativação;
  - ex-cliente que já usou a semana inicial continuar sem acesso ao encontro avulso.

## Validação

- Rodar a prévia com o histórico real de Carlos e confirmar que a resposta trata exclusivamente do Lite.
- Confirmar que o link abre a oferta Lite para o cliente correto.
- Confirmar no registro que a resposta foi enviada e entregue, sem criar `taster_offers`.
