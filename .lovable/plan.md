# Investigação da divergência no extrato Woovi

## Objetivo

Explicar por que algumas parcelas aparecem como `PAID/CONCLUDED` na área de assinaturas da Woovi, mas seus valores não aparecem nas entradas do extrato. Nenhuma cobrança, mensagem ou alteração será executada.

## Fatos já confirmados

- A consulta que indicou “pago” leu as parcelas de cada assinatura, não o extrato financeiro.
- Nove parcelas de R$ 29,90 das coortes de 04/09 e 05/09 apresentam `PAID/CONCLUDED`, data de pagamento e `endToEndId` na área de assinaturas.
- O extrato financeiro da Woovi retorna somente quatro entradas de R$ 29,90 nos últimos 12 dias; essas nove não foram localizadas ali.
- A consulta individual dos identificadores dessas cobranças retorna “Cobrança não encontrada”.
- A rota oficial de recibos da Woovi foi consultada com o `endToEndId` de três dessas parcelas e retornou, nos três casos, o comprovante Pix em PDF. Isso comprova que houve liquidação bancária; a ausência nas “Entradas” está no extrato/painel da Woovi, não no pagamento.
- A consulta individual em `/charge/{identifierId}` não é válida para essas parcelas recorrentes: cobrança avulsa e parcela de assinatura são recursos diferentes na Woovi.

## Verificação somente leitura

1. Confirmar os recibos oficiais dos seis casos restantes pelo `endToEndId`.
2. Comparar os nove recibos com as entradas exibidas no painel e no endpoint de transações.
3. Verificar qual identificador deve ser usado para localizar a transação: `endToEndId`, `identifierId`, `installmentId` ou `correlationID`.
4. Conferir se o extrato possui filtro de período, paginação, fuso, tipo de transação ou atraso de disponibilização que esconda essas entradas.
5. Separar cada um dos nove casos em:
   - recibo confirmado e entrada visível;
   - recibo confirmado, mas entrada ausente;
   - pagamento estornado/devolvido.
6. Entregar a causa comprovada e, se a divergência for da Woovi, a relação de identificadores e evidências para abertura de chamado técnico.

## Situação prática agora

- O recibo Pix oficial com `endToEndId` comprova que o débito foi liquidado na rede bancária.
- Como o valor não aparece nas transações nem no saldo disponível da conta Woovi, a Aura ainda não teve disponibilidade financeira desse dinheiro.
- Isso não é mais uma falha de cobrança dos clientes: o ponto em aberto está entre a liquidação bancária e o crédito/registro financeiro na conta Woovi.
- Também não há evidência, até aqui, de saque ou transferência que explique a saída do saldo. Essa hipótese precisa ser verificada no histórico completo de movimentações.
- Até a conciliação, os nove casos ficam classificados como **liquidados no Pix, mas não creditados/reconciliados financeiramente pela Woovi** — não como receita disponível.

## O que fazer

1. Confirmar o recibo oficial dos seis casos restantes e montar uma relação única dos nove `endToEndId`, datas, valores e assinaturas.
2. Consultar o histórico completo de entradas, saques, transferências, estornos e devoluções no mesmo período para excluir movimentação automática do saldo.
3. Conferir se todos os recibos e assinaturas pertencem exatamente à mesma conta Woovi consultada no saldo e no extrato.
4. Abrir um chamado financeiro urgente na Woovi com os nove comprovantes, pedindo a localização contábil de cada `endToEndId` e o crédito dos valores ausentes.
5. Exigir da Woovi, para cada caso, uma resposta objetiva: conta creditada, data do crédito, lançamento no extrato, eventual retirada/devolução ou motivo da retenção.
6. Manter esses pagamentos fora da receita disponível até aparecerem no extrato/saldo ou até a Woovi fornecer um documento formal de conciliação.

## Resultado esperado

- Um dossiê pronto para suporte da Woovi, com os nove casos e suas provas.
- O valor total que está liquidado, mas não disponível, separado do que efetivamente entrou.
- A causa financeira comprovada para cada pagamento e a confirmação do crédito ou da devolução.

## Limites

- Não alterar o sistema.
- Não disparar ou repetir cobranças.
- Não enviar mensagens aos clientes.
- Não contabilizar como receita qualquer parcela sem transação correspondente no extrato.