# Acompanhamento dos disparos de cobrança

## Objetivo
Exibir no painel administrativo os disparos de cobrança com clareza semelhante ao acompanhamento de checkout abandonado, sem misturar os dois fluxos.

## Alterações
- Criar um painel visível de **Disparos de cobrança**, próximo ao acompanhamento do PIX Automático.
- Mostrar um resumo do período com:
  - pessoas acionadas;
  - mensagens enviadas;
  - entregas confirmadas;
  - falhas de entrega;
  - ofertas aceitas;
  - separação por Woovi, Asaas e cartão.
- Exibir a lista recente pessoa por pessoa, com data, canal, provedor, degrau da cobrança e situação atual.
- Permitir filtrar por período e provedor, além de atualizar os dados manualmente.
- Corrigir os rótulos atuais que chamam disparos de WhatsApp de “e-mails enviados”.
- Manter o funil de checkout abandonado separado e inalterado.

## Regras de leitura
- Contar pessoas distintas nos indicadores de alcance, evitando inflar números por novas tentativas para o mesmo telefone.
- Usar o retorno de entrega do WhatsApp para diferenciar enviado, entregue e falhou.
- Mostrar falha permanente separada de tentativa ainda em processamento.
- Considerar aceite da oferta quando o registro de cobrança estiver marcado como aceito.
- Preservar o histórico completo; a tela apenas organiza os registros já existentes.

## Validação
- Conferir os totais do painel contra os registros reais dos últimos 7 e 30 dias.
- Validar a visualização em celular e computador.
- Confirmar que checkout abandonado e cobrança continuam contabilizados separadamente.
