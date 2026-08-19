# Isabella: manter o PIX, cancelar o cartão e criar a conta ativa

Decisão confirmada: o mandato PIX de hoje é o meio válido, a assinatura de cartão sai, e a conta é criada ativa seguindo o fluxo normal — **sem welcome, sem e-mail e sem qualquer mensagem para ela**.

## Contexto verificado

- PIX criado hoje 10:27 BRT: Essencial mensal, R$ 29,90, mandato aprovado, próximo débito 19/09. Sem promoção porque ela é retornante (regra correta: entrada promocional é 1× por cliente).
- Cartão: assinatura ativa desde 30/04, R$ 29,90/mês, pagamentos em 08/05, 08/06, 08/07 e 09/08, período pago até 07/09.
- Não existe perfil dela no sistema (nem por e-mail, nem pelo telefone 47996496717), e o mandato PIX está sem acesso liberado.

## Ações na conta dela

1. **Cancelar a assinatura de cartão** no Stripe imediatamente, sem cobrança adicional.
2. **Estornar o mês em duplicidade**: o cartão está pago até 07/09 e o PIX de hoje já cobriu o mesmo período — estornar a cobrança de R$ 29,90 do cartão (09/08).
3. **Criar o perfil ativo**: plano Essencial, `status = active`, telefone normalizado (5547996496717), e-mail `contatoisabelladotta@gmail.com`, meio de pagamento PIX/Woovi, `plan_expires_at` alinhado ao mandato (19/09).
4. **Vincular o mandato ao perfil**: marcar o acesso liberado no registro da assinatura PIX, para a auditoria diária e os próximos ciclos não a tratarem como pendente.
5. **Nada de comunicação**: sem welcome no WhatsApp, sem e-mail de confirmação, sem `pending_insight` de boas-vindas. A conta simplesmente entra ativa e segue o fluxo normal da Aura a partir da próxima interação dela.

## Correção no sistema

6. **Guarda anti-duplicidade no trilho PIX**: antes de criar um mandato, verificar assinatura ativa ou em atraso do mesmo e-mail/telefone no cartão e no PIX. Se existir, não criar o mandato e direcionar ao portal (trocar meio de pagamento / plano) em vez de assinar de novo. É o que teria evitado a duplicidade dela.

Fora do escopo por decisão: varredura geral de pagantes sem perfil.

## Detalhes técnicos

- Registros: mandato `4dd29a04-…` (`recurrency_id RR5481141720260819kVyMnMMSx6d`), assinatura `sub_1TS3sjQU15XnZ7VvgrwsvS8H`, cliente `cus_UQvjtiMoz9o45s`.
- Cancelamento e estorno via API do Stripe; criação do perfil e vínculo do mandato pelos mesmos campos que o `webhook-woovi` usa na ativação, apenas pulando os passos de welcome/e-mail.
- Arquivo tocado na correção: `supabase/functions/criar-pix-recorrente-woovi/index.ts`.
