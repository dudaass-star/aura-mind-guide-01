
Objetivo: corrigir a causa real do dunning que não dispara, sem perder tempo revisando webhook/Stripe config novamente.

O que a exploração mostrou
- O evento `invoice.payment_failed` está chegando e sendo gravado em `public.stripe_webhook_events`.
- Portanto, o problema não está na entrega do webhook.
- Mesmo assim, `profiles.payment_failed_at` não está sendo preenchido.
- O fluxo atual depende de `profiles.eq('phone', ...)` com correspondência exata.
- Há inconsistência de normalização de telefone entre funções.
- Em `create-checkout`, quando o cliente Stripe já existe, nome/email são atualizados, mas `metadata.phone` não é corrigido. Isso pode deixar o cliente com telefone antigo em outro formato.
- O handler de falha registra “sucesso” mesmo se 0 perfis forem encontrados, então hoje existe falso positivo de observabilidade.

Plano de implementação
1. Centralizar a resolução do perfil
- Criar um helper compartilhado para localizar o perfil a partir do cliente Stripe.
- Esse helper vai tentar variações brasileiras do telefone (com/sem `55`, com/sem nono dígito) em vez de `eq` exato.
- Fallbacks: email e sessões recentes de checkout, quando necessário.

2. Corrigir o `stripe-webhook`
- Trocar todos os pontos que fazem lookup por telefone exato:
  - `invoice.payment_failed`
  - `invoice.paid`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.resumed`
- Só marcar sucesso quando um perfil for realmente encontrado e atualizado.
- Se não encontrar perfil, logar claramente o motivo e os identificadores usados.

3. Corrigir a origem da inconsistência
- Em `create-checkout`, sempre atualizar `customer.metadata.phone` para o formato canônico atual, inclusive em clientes já existentes.
- Isso evita que eventos futuros cheguem com telefone “velho” ou em formato incompatível.

4. Adicionar trilha de auditoria do dunning
- Criar uma tabela de tentativas de dunning com:
  - `event_id`
  - `customer_id`
  - `invoice_id`
  - `subscription_id`
  - telefone bruto e telefone resolvido
  - perfil encontrado ou não
  - link gerado ou não
  - WhatsApp enviado ou não
  - estágio do erro
- Assim o próximo diagnóstico deixa de depender só de logs temporários.

5. Criar recuperação para falhas já ocorridas
- Adicionar um caminho seguro para reprocessar eventos pendentes/sem correspondência.
- Isso permite recuperar os `invoice.payment_failed` já recebidos sem depender de uma nova tentativa do Stripe.

Resultado esperado
- O sistema para de “achar” que enviou dunning quando na prática não encontrou o usuário.
- Os próximos `payment_failed` passam a:
  1. localizar o perfil corretamente,
  2. gravar `payment_failed_at`,
  3. gerar o link,
  4. enviar o WhatsApp,
  5. deixar auditoria persistente.

Detalhes técnicos
- O principal suspeito é mismatch de telefone por formatação e metadata desatualizada no cliente Stripe.
- O webhook já está funcionando; o defeito está na resolução interna do usuário e na falta de observabilidade por etapa.
- Vou seguir os padrões já existentes no projeto, reaproveitando `getPhoneVariations` para não duplicar lógica.
