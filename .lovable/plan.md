# Cris Silveiira: troca de plano travada e mudança de PIX para cartão

## O que aconteceu de fato

Cris está no **Essencial trimestral (R$ 59,70)**, pagando por **PIX Automático (Woovi)**, mandato autorizado em 20/08 e primeira parcela paga no mesmo dia. Próxima cobrança prevista: 07/12.

Ao tentar trocar de plano no Meu Espaço, ela caiu em dois furos reais:

1. **O portal não reconhece o PIX Automático da Woovi.** A tela de troca só conhece cartão, PIX Asaas e PIX Inter; quem paga pela Woovi é tratado como cartão. A troca chega ao lugar certo no servidor, que devolve **um QR novo de autorização**, mas a tela — achando que é cartão — mostra só "plano atualizado" e **descarta o QR**. A troca nunca se completa e ela não vê o que precisava aprovar no banco.
2. **Não existe caminho para sair do PIX e ir para o cartão.** O botão "Atualizar forma de pagamento" só devolve um recado mandando falar com o suporte. É exatamente o pedido dela.

Também apareceu um problema de acesso: o trimestral foi pago em 20/08, mas o acesso está liberado até **20/02/2027** — o dobro do período pago.

## O que fazer

### 1. Portal reconhece o PIX Automático da Woovi
Na tela de troca de plano, esse meio de pagamento passa a se comportar como o PIX do Inter: ao confirmar, aparece o **QR e o código PIX** para copiar, com a explicação de que é uma autorização única e que o plano atual continua valendo até o fim do período já pago.

### 2. Caminho oficial de PIX para cartão
"Atualizar forma de pagamento" ganha uma ação de verdade para quem paga por PIX: um botão que abre o pagamento no cartão já com o plano e o ciclo atuais.

### 3. Resolver o caso dela agora
Gerar para a Cris o caminho de pagamento no cartão; quando o cartão entrar, o PIX é encerrado. O acesso dela não muda em nenhum momento.

### 4. Corrigir o acesso concedido além do pago
Alinhar a validade do trimestral ao período efetivamente pago e conferir se outros trimestrais/semestrais/anuais da Woovi receberam validade maior que o pago, corrigindo os que estiverem fora.

Sem mensagem automática nova, sem alerta para admin, sem mexer em quem está funcionando.

## Furos da troca de meio de pagamento e como cada um fecha

| Risco | Como fecha |
|---|---|
| Cobrança dobrada: ela já pagou até 07/12 e o cartão cobraria hoje | O cartão entra com a primeira cobrança marcada para o fim do período já pago. Nada é cobrado no ato. |
| PIX cancelado e cartão não concluído → cliente sem cobrança e sem acesso | O PIX só é cancelado **depois** da confirmação do cartão. Se ela abandonar, nada muda. |
| Cartão confirmado e PIX seguindo vivo → cobrança dupla no fim do período | Na confirmação do cartão, o mandato PIX é cancelado e marcado como substituído, saindo de todas as filas de cobrança e de recuperação. |
| Falha ao cancelar o PIX (fora do ar) | O mandato é marcado como substituído localmente na mesma hora (isso já basta para parar as cobranças) e o cancelamento é retentado pela varredura diária. |
| Régua de recuperação disparando para o mandato antigo | Tarefas pendentes do mandato substituído são encerradas junto. |
| Acesso encurtado por engano depois da migração | A regra que limita acesso ao que foi pago passa a valer só para quem ainda é cliente PIX; quem migrou para cartão fica fora dela. |
| Evento atrasado do PIX voltando a marcar o cliente como PIX | Depois da migração, evento de mandato substituído não reescreve mais o meio de pagamento nem a validade. |
| Assinatura duplicada no cartão | A trava anti-duplicidade do checkout continua valendo e a migração reaproveita o cliente existente. |
| Contabilizar a migração como venda nova nos relatórios/anúncios | A migração é marcada como troca de meio de pagamento, não como nova compra. |
| Cancelamento futuro dela | Passa a seguir o fluxo de cartão; o registro do PIX substituído não gera um segundo cancelamento. |
| Fim do acesso após migrar | Continua ancorado no último pagamento efetivo — agora o do cartão. |

## Detalhes técnicos

- `src/pages/UserPortal.tsx`: adicionar `"woovi-pix"` ao `paymentGateway` do `ChangePlanDialog` (hoje `card_gateway === "woovi"` cai no `else` → `"stripe-card"`); em `handleOpenBillingPortal`, para `isWooviPix`/`isInterPix`/`isAsaasPix`, substituir o `toast` informativo por ação "Passar para cartão".
- `src/components/portal/ChangePlanDialog.tsx`: aceitar `"woovi-pix"` no tipo, incluir em `showsNextCharge` e nas cópias (`copyDescription`/`copyConfirm`), reusando o texto do Inter. O retorno de `change-subscription-plan` já traz `qrCodeImage`/`copyPaste` (spread de `criar-pix-recorrente-woovi` em modo `reauthorize` + `deferReplacement`) — hoje descartados no ramo de cartão.
- `supabase/functions/change-subscription-plan/index.ts`: ramo Woovi já correto (linhas 143-205); só validar os nomes dos campos de QR devolvidos.
- Nova rota de migração (modo em `create-checkout`, ex. `switchFromPix: true`): resolve `plan`/`billing` do perfil, cria a assinatura Stripe com `trial_end` = `plan_expires_at` corrigido (fim do período PIX efetivamente pago) e grava metadata `migration_from: "woovi"` para o `stripe-webhook` não emitir Purchase/Subscribe de venda nova (`mem/marketing/meta-purchase-first-only.md`). Anti-dup atual (`create-checkout:259-299`) só olha Stripe, então não bloqueia.
- `supabase/functions/stripe-webhook/index.ts`: no `checkout.session.completed` com `migration_from = "woovi"`, cancelar o mandato via `PUT https://api.woovi.com/api/v1/subscriptions/{id}/cancel` (mesmo padrão de `cancel-subscription/index.ts:368-395`), gravar `replaced_by_subscription_id` + `status` cancelado em `woovi_subscriptions`, cancelar `scheduled_tasks` `woovi_*` pendentes do mandato e setar `card_gateway = 'stripe'`. Falha na chamada Woovi não bloqueia: `replaced_by_subscription_id` já remove o mandato de `MANDATE_ACTIVE_STATUSES` e da varredura de `woovi-pix-audit`.
- `supabase/functions/webhook-woovi/index.ts`: nos ramos que escrevem `card_gateway`/`plan_expires_at` (≈332, 449, 466), ignorar quando o mandato tem `replaced_by_subscription_id` ou o perfil já está em outro gateway.
- `supabase/functions/_shared/woovi-access.ts`: hoje só conhece `ENTRY_ACCESS_DAYS = 8` e `CYCLE_ACCESS_DAYS = 31` — cria janela por `billing_period` (quarterly ≈ 92, semiannual ≈ 184, yearly ≈ 366) e passa a **não** aplicar teto quando `profiles.card_gateway !== 'woovi'`, senão o cliente migrado para cartão seria cortado.
- Dado fora da regra: `profiles.plan_expires_at` de `ef894fb2-…` = 2027-02-20 com entrada trimestral paga em 2026-08-20. Correção pontual por SQL de manutenção, mais varredura dos demais ciclos longos da Woovi.
- Sem migration de schema. Redeploy: `create-checkout`, `stripe-webhook`, `webhook-woovi`, `change-subscription-plan`, `woovi-pix-audit`, `execute-scheduled-tasks`.
