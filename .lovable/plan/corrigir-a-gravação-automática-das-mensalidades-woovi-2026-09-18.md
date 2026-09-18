# Corrigir a gravação automática das mensalidades Woovi

## Diagnóstico confirmado

O pagamento acontece corretamente no banco e aparece na parcela da assinatura na Woovi, mas três caminhos que deveriam trazê-lo ao nosso histórico estão falhando:

1. **A Woovi não envia o evento das mensalidades.** Hoje chegaram eventos das novas entradas, mas nenhum evento das mensalidades pagas. Por isso o registro não nasce pelo caminho principal.
2. **A conferência geral consulta o lugar errado para esse tipo de pagamento.** Ela lê a assinatura, cuja resposta não contém as parcelas. As mensalidades pagas estão em `/subscriptions/{id}/installments`; assim, a rotina conclui incorretamente que o ciclo está “sem cobrança”.
3. **A conciliação pelo extrato não consegue terminar.** A rotina de dez minutos está ativa, mas suas chamadas estão expirando no limite de cinco segundos. Portanto, ela não chega à etapa que reenvia o pagamento ao fluxo responsável por gravar a mensalidade e renovar o acesso.

Isso explica o caso de hoje: a Woovi confirma diretamente as mensalidades, mas nosso histórico continua vazio porque o evento não chegou e os dois caminhos de recuperação não completaram o trabalho.

## Correção

1. **Usar as parcelas da assinatura como fonte principal de reconciliação.**
   - Consultar `/subscriptions/{id}/installments` para os mandatos cujo ciclo venceu recentemente.
   - Reconhecer somente parcelas com pagamento comprovado (`COMPLETED` + cobrança `CONCLUDED` ou tentativa `PAID`).
   - Usar o identificador real da parcela/cobrança para impedir duplicidade.

2. **Manter uma única porta de gravação.**
   - Repassar cada pagamento confirmado ao mesmo fluxo que hoje grava `woovi_charges`, renova o acesso e cancela recuperações pendentes.
   - Não atualizar acesso ou marcar pagamento diretamente pela auditoria.

3. **Separar a reconciliação rápida da auditoria pesada.**
   - A rotina de dez minutos fará apenas: localizar ciclos vencidos recentes, consultar parcelas, registrar pagamentos ausentes e encerrar.
   - A auditoria geral continuará responsável por divergências, mandatos e régua de cobrança, sem bloquear a entrada de pagamentos.

4. **Eliminar falso “sem cobrança”.**
   - Antes de marcar um ciclo como ausente, consultar a lista real de parcelas.
   - `AB10`, `EXPR`, `REQUESTED`, `PAID` e mandato revogado serão tratados conforme o estado real retornado pela Woovi.

5. **Reconciliar o passado imediato.**
   - Rodar primeiro em simulação para todos os ciclos desde 16/09.
   - Gravar somente mensalidades comprovadas e ainda ausentes.
   - Conferir valor, data, cliente, renovação do acesso e cancelamento da recuperação de cada caso.

6. **Validar o funcionamento contínuo.**
   - Confirmar que uma mensalidade paga aparece no histórico em até dez minutos mesmo sem evento da Woovi.
   - Confirmar idempotência repetindo a rotina sem criar duas mensalidades nem renovar o acesso duas vezes.
   - Conferir que recusas continuam na régua e não são registradas como pagamento.

## Detalhes técnicos

- Ajustar `woovi-pix-audit` para reconciliar ciclos via `listInstallments`/`/installments`, priorizando mandatos com `next_charge_date <= hoje`.
- Preservar `replayToWebhook` como fonte única de gravação e ativação.
- Reduzir o trabalho do modo `{ only: "extrato" }` ou criar um modo rápido específico de parcelas, compatível com a janela curta da rotina agendada.
- Depois da publicação, reconciliar Daniela, Luciana, Amanda e demais pagamentos confirmados desde 16/09 que ainda não estejam no histórico.
