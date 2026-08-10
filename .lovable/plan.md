# PIX Automático recorrente na Woovi (substituindo o Asaas bloqueado)

## Respondendo direto: onde clicar nessa tela

Na tela **API/Plugins** que você abriu:

1. Aba **API/Plugins** → card **API REST** → **Adicionar**. Isso cria um App e gera o **AppID** (é o token que vai no header `Authorization`). Guarde o valor — só aparece na criação (depois em "Visualização de credenciais").
2. No mesmo lugar → card **Webhook** → **Adicionar**. URL a cadastrar (vou te passar depois de criar a função):
   `https://<projeto>.supabase.co/functions/v1/webhook-woovi`
   Eventos a marcar: cobrança paga/expirada + **todos os de Pix Automático** (autorização e cobrança recorrente).
3. Antes disso, confirme na conta: **Pix Automático habilitado** (Configurações da Empresa / Ajuda-Sobre). Se o recurso não estiver liberado pra sua conta, a criação de assinatura `PIX_RECURRING` volta erro — nesse caso é só pedir a liberação no suporte deles.

Só preciso de você: o **AppID** (guardo como secret `WOOVI_APP_ID`). O resto é código.

## O que a documentação confirma (checado agora)

A Woovi tem Pix Automático Bacen de verdade, e o modelo é quase idêntico ao que já construímos no Asaas:

- `POST /api/v1/subscriptions` com `type: "PIX_RECURRING"`, `frequency` (`WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMIANNUALLY`, `ANNUALLY` — cobre nossos 4 ciclos), `dayGenerateCharge` (dia do mês ou data ISO), `dayDue`, `comment` (contrato, < 30 chars).
- `pixRecurringOptions`: `journey: "PAYMENT_ON_APPROVAL"` (paga e autoriza no mesmo QR — o que a gente quer), `retryPolicy: "THREE_RETRIES_7_DAYS"` (mesma política 3R/7D do Asaas), `minimumValue` para valor variável.
- Estados separados: assinatura (`ACTIVE/EXPIRED/INACTIVE`), mandato `pixRecurring` (`CREATED → APPROVED`, `REJECTED` = cliente removeu no app do banco, `CANCELED` = nós cancelamos), parcela (`SCHEDULED → ACTIVE → COMPLETED/EXPIRED`).
- **Valor variável resolve a semana de R$ 6,90**: manda `value = 690` + `minimumValue = 690`; a primeira parcela (paga na aprovação) sai 6,90, e depois `PUT /api/v1/subscriptions/{id}/value` sobe pro mensal cheio. Se precisar de controle fino, `POST /api/v1/installments/{id}/cobr` cria a cobrança da parcela com o valor que eu mandar.
- Webhooks de Pix Automático incluem `PIX_AUTOMATIC_COBR_TRY_REJECTED` (falha imediata) e `PIX_AUTOMATIC_COBR_REJECTED` (falhou até expirar) — é exatamente o gancho que o dunning precisa.

## Objetivo

1. PIX recorrente voltando a vender **hoje**, sem depender da conta bloqueada do Asaas.
2. Manter a regra comercial: **1ª semana R$ 6,90 (ou 11,90 / 24,90) e depois o mensal cheio no débito automático**; Tri/Sem/Anual à vista + recorrência, sem trial.
3. Asaas em modo somente-legado: os assinantes PIX atuais continuam lá, nenhuma venda nova.

## Fase 0 — Fechar a torneira do Asaas

- `asaas-health-check`: bate num endpoint operacional, classifica `ok | blocked | invalid` e grava em `system_config.asaas_operational_status`. Cron de 15 min.
- Novo `system_config.pix_gateway` (`woovi` | `asaas`) — chave única pra virar o trilho de PIX sem deploy, no padrão do `card_gateway` que já existe no AdminSettings.
- `CheckoutV2.tsx` respeita as duas chaves: PIX aponta pra Woovi; se a Woovi cair, PIX some da UI em vez de gerar QR que não nasce.

## Fase 1 — Criar a assinatura Woovi

Nova função `criar-pix-recorrente-woovi`, espelhando `criar-pix-recorrente-asaas`:

- Mensal: `value = trial (690/1190/2490)`, `minimumValue = trial`, `frequency: MONTHLY`, `journey: PAYMENT_ON_APPROVAL`, `dayGenerateCharge = hoje`, `retryPolicy: THREE_RETRIES_7_DAYS`. QR imediato cobra o trial e autoriza o mandato.
- Tri/Sem/Anual: valor cheio, `frequency` correspondente, sem trial.
- Retornante (`isReturningCustomer`) não pega trial — mesma regra que já vale hoje.
- Grava `woovi_subscription_id`, `correlationID` e `mandate_status` no registro de pagamento, e devolve `brCode` + QR pro modal do checkout.
- CPF e **endereço completo** são obrigatórios na Woovi — o checkout já coleta CPF; endereço entra via CEP (só CEP + número, o resto autocompleta) ou usamos o endereço da empresa quando a Woovi aceitar.

## Fase 2 — Webhook e ciclo de vida

Nova função `webhook-woovi` (verify_jwt = false, validação de assinatura do webhook):

- Cobrança do trial paga → ativa o plano com 7 dias de `plan_expires_at`, marca `is_trial` (mesma tolerância de R$ 0,50 que o `webhook-asaas` usa).
- Mandato `APPROVED` → agenda a subida do valor: `PUT /subscriptions/{id}/value` para o mensal cheio, com a próxima parcela em D+7.
- Parcela `COMPLETED` → estende o ciclo normalmente.
- `PIX_AUTOMATIC_COBR_TRY_REJECTED` → não é churn ainda: entra na janela de retentativa, dunning silenciado.
- `PIX_AUTOMATIC_COBR_REJECTED` → aciona o dunning PIX que já existe (2 avisos → escada de ofertas).
- `pixRecurring: REJECTED` (cliente cancelou no banco) → churn silencioso → fluxo `/reautorizar-pix` apontando pra Woovi.
- Dedupe por `correlationID` + parcela, pra não repetir o problema da "fatura gêmea" do Asaas.

## Fase 3 — Dunning, portal e admin

- `profiles.payment_rail` reconhece `woovi_pix` (junto de `stripe_card`, `asaas_pix_legacy`), e o dunning/portal escolhem o link certo.
- `customer-portal`: assinante Woovi vê status do mandato e instrução de cancelamento pelo app do banco; cancelamento nosso via `DELETE`/cancel da assinatura.
- Auditoria diária `woovi-pix-auto-audit`, no molde da do Asaas: reconcilia parcelas pagas sem webhook, mandatos `CREATED` parados e órfãos.
- Painel admin ganha o placar de saúde do PIX Woovi (mandatos aprovados / pendentes / rejeitados).

## Detalhes técnicos

- Secret: `WOOVI_APP_ID` (header `Authorization: <AppID>`), base `https://api.woovi.com`.
- Arquivos: novos `supabase/functions/criar-pix-recorrente-woovi/`, `webhook-woovi/`, `woovi-pix-auto-audit/`, `asaas-health-check/`, `_shared/woovi.ts`; alterados `src/pages/CheckoutV2.tsx`, `_shared/dunning-whatsapp.ts`, `customer-portal`, `AdminSettings.tsx`.
- Sem camada multi-gateway genérica: uma chave `pix_gateway` decide o trilho, o Asaas fica em leitura.
- Teste real de ponta a ponta com um pagamento de R$ 6,90 no meu cartão de teste não existe pra PIX — a validação vai ser uma venda real de 6,90 sua, acompanhando o mandato até o débito de D+7.

## Ordem

Você cria API REST + Webhook na Woovi e me passa o AppID → Fase 0 → Fase 1 → Fase 2 → Fase 3.
