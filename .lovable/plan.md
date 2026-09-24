# Finalizar medição e retorno do checkout da V4

## Resultado
A V4 será medida pelos mesmos canais das páginas anteriores e o cliente que cancelar o pagamento externo voltará ao checkout com a origem, o plano e o ciclo preservados.

## Alterações
- Incluir `/v4` entre as páginas acompanhadas pelo Google Analytics e pelo Clarity.
- Enviar ao pagamento externo uma URL de cancelamento que preserve `lp=v4`, a origem do botão, o plano e a periodicidade escolhidos.
- Manter o retorno de pagamento aprovado em `/obrigado`, seguido da liberação automática do App.
- Validar o percurso V4 → checkout Essencial → retorno, sem realizar cobrança real.

## Critérios de conclusão
- A entrada direta em `/v4` inicializa Google Analytics e Clarity.
- Todos os botões da V4 continuam abrindo o Essencial mensal e identificando a origem.
- O cancelamento do pagamento externo retorna ao checkout com a mesma seleção e atribuição.
- O retorno aprovado continua apontando para `/obrigado`.
- A página não apresenta erros no celular ou no desktop.
