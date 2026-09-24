# Corrigir a defesa automática das disputas Woovi

## Resultado

- Processar agora as disputas abertas encontradas, enviando evidência somente quando houver autorização e uso comprovados.
- Fazer uma reconciliação automática diária com a Woovi, como proteção quando o aviso instantâneo não chegar.
- Ignorar disputas já encerradas e impedir reenvio de evidências já aceitas.
- Alertar a administração quando uma disputa aberta continuar sem evidência, incluindo os casos em que a regra indicar devolução.
- Atualizar o painel para diferenciar defesa enviada, devolução sugerida e falha real.

## Detalhes técnicos

- Restringir o processamento aos estados realmente abertos da Woovi.
- Tornar o envio e o alerta idempotentes para não duplicar documentos nem e-mails.
- Agendar uma única verificação diária, mantendo o webhook como caminho imediato.
- Validar no ambiente real que as disputas abertas foram classificadas corretamente e que a evidência elegível aparece como enviada.