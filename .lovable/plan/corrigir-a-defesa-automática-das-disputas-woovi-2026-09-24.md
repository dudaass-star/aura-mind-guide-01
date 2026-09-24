# Corrigir a defesa automática das disputas Woovi

## Resultado

- Processar agora as disputas abertas encontradas, reconhecendo tanto assinaturas quanto compras avulsas e enviando a comprovação disponível de autorização, pagamento, acesso e uso.
- Fazer uma reconciliação automática diária com a Woovi, como proteção quando o aviso instantâneo não chegar.
- Ignorar disputas já encerradas e impedir reenvio de evidências já aceitas.
- Alertar a administração quando uma disputa aberta continuar sem evidência ou quando algum dado necessário não puder ser vinculado automaticamente.
- Atualizar o painel para diferenciar defesa enviada, devolução sugerida e falha real.

## Detalhes técnicos

- Corrigir o vínculo das compras avulsas de R$ 6,90: hoje a defesa procura primeiro cobranças recorrentes e não reconheceu uma compra válida que está registrada na oferta avulsa e no perfil do cliente.
- Separar “compra autorizada e entregue” de “uso relevante”: a defesa documentará pagamento e acesso mesmo quando o cliente ainda não tiver usado; uso será uma prova adicional, não condição para reconhecer legitimidade.
- Restringir o processamento aos estados realmente abertos da Woovi.
- Tornar o envio e o alerta idempotentes para não duplicar documentos nem e-mails.
- Agendar uma única verificação diária, mantendo o webhook como caminho imediato.
- Validar no ambiente real que as duas disputas abertas foram classificadas corretamente e que ambas aparecem com a evidência correspondente enviada.