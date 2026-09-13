# Investigação da divergência no extrato Woovi

## Objetivo

Explicar por que algumas parcelas aparecem como `PAID/CONCLUDED` na área de assinaturas da Woovi, mas seus valores não aparecem nas entradas do extrato. Nenhuma cobrança, mensagem ou alteração será executada.

## Fatos já confirmados

- A consulta que indicou “pago” leu as parcelas de cada assinatura, não o extrato financeiro.
- Nove parcelas de R$ 29,90 das coortes de 04/09 e 05/09 apresentam `PAID/CONCLUDED`, data de pagamento e `endToEndId` na área de assinaturas.
- O extrato financeiro da Woovi retorna somente quatro entradas de R$ 29,90 nos últimos 12 dias; essas nove não foram localizadas ali.
- A consulta individual dos identificadores dessas cobranças retorna “Cobrança não encontrada”.
- Portanto, neste momento elas não devem ser chamadas de receita recebida. O estado correto é: **conclusão informada pela assinatura, sem entrada financeira comprovada no extrato**.

## Verificação somente leitura

1. Identificar o significado contratual de `PAID`, `CONCLUDED` e `COMPLETED` no PIX Automático da Woovi.
2. Confirmar se esses estados representam liquidação financeira, aceite bancário ou somente encerramento da tentativa/parcela.
3. Verificar qual identificador deve ser usado para localizar a transação: `endToEndId`, `identifierId`, `installmentId` ou `correlationID`.
4. Conferir se o extrato possui filtros, paginação, fuso, data de competência ou atraso de disponibilização que escondam essas entradas.
5. Separar cada um dos nove casos em:
   - entrada financeira encontrada;
   - liquidação aguardando lançamento;
   - status inconsistente da Woovi;
   - pagamento estornado/devolvido;
   - cobrança não efetivamente recebida.
6. Entregar a causa comprovada e, se a divergência for da Woovi, a relação de identificadores e evidências para abertura de chamado técnico.

## Limites

- Não alterar o sistema.
- Não disparar ou repetir cobranças.
- Não enviar mensagens aos clientes.
- Não contabilizar como receita qualquer parcela sem transação correspondente no extrato.