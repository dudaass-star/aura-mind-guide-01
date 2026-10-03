# Corrigir a defesa automática das disputas PIX

## Objetivo
Garantir que cada disputa encontre a cobrança e o cliente corretos, monte o dossiê disponível e envie as evidências dentro do prazo.

## Implementação
- Corrigir a identificação pelo End-to-End ID também dentro dos dados completos da cobrança, além dos campos diretos atuais.
- Adicionar caminhos seguros de associação por cobrança, assinatura e cliente quando a Woovi enviar formatos diferentes.
- Registrar no resumo da defesa qual caminho identificou a transação, permitindo auditoria posterior.
- Reavaliar automaticamente disputas ainda abertas que antes ficaram sem vínculo, sem enviar evidência quando houver ambiguidade entre clientes.
- Reforçar o alerta operacional para destacar disputas sem vínculo ou sem evidência antes do vencimento.

## Validação
- Usar a disputa real já encerrada apenas como teste de identificação e geração do dossiê, sem tentar reenviá-la.
- Confirmar que a cobrança de R$ 49,90 e a conta correspondente passam a ser localizadas pelo End-to-End ID real.
- Testar cenários sem vínculo e com múltiplos candidatos para garantir que nenhuma evidência seja atribuída ao cliente errado.
- Conferir os registros da função e a saúde do projeto após a mudança.

## Limite
A correção protege disputas novas e ainda abertas. A disputa já reembolsada não pode ser revertida automaticamente por este fluxo.
