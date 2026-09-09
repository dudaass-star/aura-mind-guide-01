# Cristiane (crissilveiira@gmail.com) — troca para o Anual no cartão

## O que já está certo

- Pagamento aprovado hoje, 09/09 às 17:04 (BRT): **R$ 118,80**, Essencial Anual.
- Assinatura no cartão está **ativa**, com renovação prevista para **09/09/2027**, sem cancelamento agendado.
- O antigo débito automático no PIX dela está **recusado/inativo** — não há risco de cobrança dobrada.

## O que ficou errado no cadastro dela

A compra entrou pelo checkout normal (não pelo botão "trocar para cartão"), então a parte do sistema que ajusta o cadastro quando alguém sai do PIX e vai para o cartão **não rodou**. Consequências, hoje, no cadastro dela:

1. O meio de pagamento dela continua registrado como **PIX**, embora ela esteja no cartão.
2. A validade do acesso continua **20/11/2026**, herdada do PIX trimestral antigo — deveria ir até **09/09/2027**, que é o que ela pagou.
3. Pior: como o cadastro ainda diz "PIX", a rotina que confere o acesso do PIX pode **encurtar** essa validade para o último PIX pago (agosto), tirando o acesso dela indevidamente a qualquer momento.

Ou seja: o dinheiro entrou certo, o acesso dela é que está mal registrado.

## Correções

1. Corrigir o cadastro da Cristiane: meio de pagamento = cartão, plano Essencial anual, acesso válido até 09/09/2027, e encerrar em definitivo o registro do débito PIX antigo.
2. Fechar o furo para os próximos: quando alguém que estava no PIX paga uma assinatura nova no cartão pelo checkout comum, o sistema deve fazer o mesmo que faz na troca oficial — passar o cadastro para cartão, desligar o débito PIX e tirar essa pessoa das filas de cobrança e recuperação do PIX.
3. Passar a registrar a validade do acesso também nas assinaturas por cartão, conforme o ciclo pago (mensal, trimestral, semestral ou anual), em vez de deixar o campo intocado.
4. Rodar uma varredura para achar outros clientes na mesma situação (pagando no cartão, mas registrados como PIX) e corrigir.

## Detalhes técnicos

- `stripe-webhook`: hoje o bloco de migração só roda com `session.metadata.migration_from`. Estender para o caso "perfil existente com `card_gateway` diferente de `stripe` + sessão de assinatura no cartão": setar `card_gateway: 'stripe'`, cancelar mandatos Woovi vivos (`replaced_by_subscription_id`), cancelar `scheduled_tasks` `woovi_%` pendentes.
- No mesmo webhook, calcular `plan_expires_at` para `sessionMode === 'subscription'` a partir do `billing` (31/92/184/366 dias ou fim do período da assinatura), não só para pagamento avulso.
- `_shared/woovi-access.ts` já ignora perfis com `card_gateway` diferente de `woovi`; com a correção acima ela sai do escopo do cap.
- Correção pontual da Cristiane via migração de dados (perfil `ef894fb2-…` e mandato Woovi `2a5ca8d0-…`).
- Varredura: perfis `card_gateway = 'woovi'` (ou nulo) com assinatura Stripe ativa no mesmo e-mail/telefone.
