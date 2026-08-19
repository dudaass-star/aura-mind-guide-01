# Isabella: por que veio R$ 29,90 em vez de R$ 6,90 — e o problema maior

## O que os dados mostram (verificado agora)

- A assinatura PIX dela foi criada hoje 10:27 BRT: plano Essencial mensal, `is_trial = false`, valor R$ 29,90, modo `native` (mandato puro, sem entrada promocional). Ou seja: o sistema **decidiu de propósito** não dar a promoção.
- O motivo: ela é classificada como **cliente retornante**. E de fato é — mais que isso: ela tem uma **assinatura de cartão ATIVA** desde 30/04/2026, R$ 29,90/mês, com cobranças pagas em 08/05, 08/06, 08/07 e 09/08. A próxima renovação no cartão está marcada para 07/09.
- A regra vigente (promo de entrada é 1× por cliente) foi aplicada corretamente. Então o "erro" que você viu não é um bug da promo: é a regra funcionando.

## O problema real, que é mais grave

1. **Cobrança duplicada em formação.** Ela agora tem assinatura ativa no cartão **e** um mandato PIX aprovado com próximo débito em 19/09. Nada no fluxo PIX bloqueia quem já tem assinatura ativa (o bloqueio anti-duplicidade existe só no caminho do cartão). Sem intervenção, ela paga duas vezes.
2. **Ela não tem perfil no sistema.** Não existe nenhum registro de usuária com esse e-mail nem com o telefone dela (47996496717), apesar de 4 meses de pagamento no cartão. E o mandato PIX de hoje está com `access_granted_at` vazio. Provável explicação de por que ela refez o checkout: nunca teve (ou perdeu) o acesso.

## Ações imediatas na conta dela

1. Decidir com ela qual meio fica. O caminho mais limpo: **manter o PIX recém-autorizado e cancelar a assinatura do cartão** — ou o contrário, se ela preferir. Cancelar a que sobra, sem cobrança extra.
2. Estornar o valor duplicado se as duas cobranças se sobrepuserem no mesmo período (o cartão está pago até 07/09; se o PIX de hoje já debitou os R$ 29,90, há um mês pago em dobro → estorno de um deles).
3. Criar/restaurar o perfil dela com acesso ativo, gerar token do portal e disparar o welcome da Aura no WhatsApp — hoje ela está pagando e sem conta.
4. Investigar por que o perfil nunca existiu (o pagamento de 30/04 no cartão passou pelo webhook, mas nenhum perfil foi criado) — isso pode ter atingido outros clientes do mesmo período.

## Correções no sistema

1. **Guarda anti-duplicidade no trilho PIX** (`criar-pix-recorrente-woovi`): antes de criar mandato, checar assinatura ativa/`past_due` no Stripe e mandato ativo no Woovi/Inter/Asaas para o mesmo e-mail/telefone. Se existir, não criar o mandato; devolver código próprio e, no checkout, explicar que já existe assinatura ativa e oferecer o portal (trocar meio de pagamento / plano) em vez de assinar de novo.
2. **Deixar claro para o cliente retornante que não há promo.** Hoje a queda de R$ 6,90 → R$ 29,90 é silenciosa e o cliente acha que é falha. No `CheckoutV2`, quando a resposta vem com `trial: false` e o cliente pediu mensal, mostrar a linha de preço já ajustada antes de abrir o QR ("promoção de primeira semana é válida uma vez por cliente"), para não haver surpresa no app do banco.
3. **Varredura de clientes pagantes sem perfil**: comparar assinaturas ativas do Stripe e mandatos ativos de PIX com a tabela de perfis e alertar no admin; hoje esse tipo de caso só aparece quando o cliente reclama.

## Detalhes técnicos

- Arquivos: `supabase/functions/criar-pix-recorrente-woovi/index.ts` (guarda de assinatura ativa e retorno do motivo da ausência de promo), `src/pages/CheckoutV2.tsx` (aviso de promo indisponível + tratamento do novo código de erro), função de auditoria/cron para o cruzamento pagante-sem-perfil.
- Registros de referência: mandato PIX `4dd29a04-…` (`recurrency_id RR5481141720260819kVyMnMMSx6d`), assinatura de cartão `sub_1TS3sjQU15XnZ7VvgrwsvS8H`, cliente `cus_UQvjtiMoz9o45s`.
- A regra "promo 1× por cliente" fica como está; a mudança é de comunicação e de bloqueio de assinatura duplicada.
