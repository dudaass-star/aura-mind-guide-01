# Escala segura da condução inicial

## Objetivo
Preparar a condução dos primeiros 14 dias para crescer sem atrasos, perdas ou duplicidades, mantendo exatamente a mesma experiência para o cliente.

## O que será feito
1. **Processamento em lotes**
   - Avaliar grupos pequenos de clientes por execução, em vez de todos de uma vez.
   - Continuar automaticamente no grupo seguinte até concluir os clientes elegíveis.
   - Permitir retomada segura se uma execução falhar ou atingir o limite de tempo.

2. **Leituras eficientes**
   - Buscar os sinais de uso de cada grupo em consultas agregadas, evitando várias leituras individuais por cliente.
   - Manter o comportamento seguro: se algum conjunto necessário não puder ser lido, não enviar e tentar depois.

3. **Proteções de concorrência**
   - Impedir que duas execuções simultâneas criem avisos duplicados.
   - Preservar limites, horário de silêncio, relevância atual e máximo de três pushes realmente enviados.

4. **Conversão verdadeira da conversa**
   - Registrar a conversão após qualquer mensagem aceita: texto, áudio, reenvio ou envio que ficou aguardando conexão.
   - Manter a atribuição ligada somente ao push correto e dentro da janela válida.

5. **Medição operacional**
   - Registrar quantidade avaliada, ignorada, programada, enviada e com falha por lote.
   - Medir duração total e por cliente para detectar perda de capacidade antes de afetar usuários.

## Validação
- Testes da árvore de decisão, calendário BRT, lotes, continuação, concorrência e retomada.
- Simulação com volumes equivalentes a 50, 100, 200 e 300 clientes elegíveis.
- Simulação de texto, áudio, reenvio e fila offline para confirmar atribuição da conversão.
- Confirmação de ausência de duplicidade e respeito aos limites de notificação.
- Publicação das funções alteradas, inspeção dos registros e limpeza dos dados temporários.
- A validação física de push em Android e iPhone permanece como etapa externa do piloto.

## Resultado esperado
A rotina deixa de depender de uma execução longa, pode crescer por lotes e retomar de onde parou. Toda conversa aceita passa a ser medida corretamente, sem mudança visual ou interrupção no chat.

## Detalhes técnicos
- Paginação determinística por identificador do cliente, com tamanho de lote limitado.
- Encadeamento controlado da próxima página pelo executor existente.
- Carregamento agregado dos sinais e entregas do lote.
- Idempotência mantida por cliente, marco e dia BRT.
- Conversão centralizada no sucesso da função comum de envio da conversa.