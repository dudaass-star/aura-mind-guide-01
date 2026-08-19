# Isabella: manter o PIX, cancelar o cartão e criar a conta

Decisão confirmada: o mandato PIX autorizado hoje é o meio válido; a assinatura de cartão sai; a conta dela é criada com acesso ativo.

## Contexto verificado

- PIX criado hoje 10:27 BRT: Essencial mensal, R$ 29,90, mandato aprovado, próximo débito 19/09. Sem promoção porque ela é cliente retornante (regra correta: promo de entrada é 1× por cliente).
- Cartão: assinatura ativa desde 30/04, R$ 29,90/mês, pagamentos em 08/05, 08/06, 08/07 e 09/08, período pago até 07/09.
- Não existe perfil dela no sistema (nem por e-mail, nem pelo telefone 47996496717), e o mandato PIX está sem acesso liberado. Ela pagava e não tinha conta.

## Ações na conta dela

1. **Cancelar a assinatura de cartão** no Stripe imediatamente, sem cobrar nada a mais. Como o cartão já está pago até 07/09 e o PIX de hoje também cobriu o mês, há um período em duplicidade: estornar uma das cobranças de R$ 29,90 (a do cartão de 09/08) para ela não pagar dois meses sobrepostos.
2. **Criar o perfil** com plano Essencial, status ativo, telefone normalizado (5547996496717), origem de pagamento PIX/Woovi, `plan_expires_at` alinhado ao mandato (19/09) e marcação de que o acesso veio do mandato de hoje.
3. **Gerar o token do portal** e disparar o **welcome da Aura no WhatsApp** (mais o e-mail de confirmação), tratando como boas-vindas de assinante novo no sistema.
4. **Confirmar o vínculo do mandato**: gravar o acesso liberado no registro da assinatura PIX para a auditoria diária e os próximos ciclos não a tratarem como pendente.
5. **Responder a ela** explicando com honestidade: a primeira semana promocional vale uma vez por cliente e ela já tinha usado no cartão, por isso o valor de hoje foi o mensal cheio; o cartão foi cancelado, o mês em duplicidade estornado e o acesso já está liberado.

## Rede de segurança (fora da conta dela)

6. **Varredura de pagantes sem perfil**: cruzar assinaturas ativas do Stripe e mandatos PIX ativos com a tabela de perfis e alertar no admin. O caso dela só apareceu porque ela reclamou.
7. **Guarda anti-duplicidade no trilho PIX**: antes de criar mandato, verificar assinatura ativa/em atraso do mesmo e-mail ou telefone em cartão e PIX; se existir, não criar o mandato e direcionar ao portal em vez de assinar de novo.

## Detalhes técnicos

- Registros: mandato `4dd29a04-…` (`recurrency_id RR5481141720260819kVyMnMMSx6d`), assinatura `sub_1TS3sjQU15XnZ7VvgrwsvS8H`, cliente `cus_UQvjtiMoz9o45s`.
- Cancelamento e estorno via API do Stripe; criação de perfil, token de portal e welcome pelos mesmos caminhos já usados na ativação do webhook Woovi (evita divergência de fluxo).
- Arquivos tocados nas correções: `supabase/functions/criar-pix-recorrente-woovi/index.ts` (guarda de assinatura ativa) e uma rotina de auditoria pagante-sem-perfil.
