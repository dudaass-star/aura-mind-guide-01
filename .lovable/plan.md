# PIX recorrente: sair do Asaas bloqueado usando Pix Automático do Stripe

## O que a pesquisa mostrou

Fui atrás do Pix Automático (Bacen) em cada provedor. Resultado:

- **Mercado Pago: não tem API de Pix Automático.** O índice oficial de documentação (`developers/pt/docs/llms.txt`) lista apenas Pix à vista (Checkout API, Bricks, Orders, reembolso). As páginas de assinatura (`/subscriptions`, `/preapproval`) só aceitam cartão. Existe comunicação de marketing no blog do Mercado Pago sobre Pix Automático, mas nenhuma rota pública documentada — as URLs candidatas de doc retornam 404. Ou seja: integrar Pix Automático via Mercado Pago hoje seria apostar em algo sem documentação.
- **Stripe TEM Pix Automático nativo, com mandato Bacen.** Documentado em `docs.stripe.com/payments/pix/pix-automatico`: o cliente autoriza o mandato no app do banco, o Stripe dispara a pré-notificação de 3 dias, espera e debita sozinho. Funciona com **Stripe Billing/Subscriptions**, tem retentativas automáticas (1x por dia por 3 dias) e suporta Connect.
- Nossa conta Stripe é **brasileira** (`country: BR`, `default_currency: brl`, `charges_enabled: true`), que é o requisito de localização do Pix. Hoje as capabilities ativas são `card_payments` e `boleto_payments` — **`pix_payments` ainda não está ativa**, então o Pix precisa ser habilitado no painel do Stripe antes de qualquer código rodar.
- Alternativas com Pix Automático documentado, caso o Stripe negue: Iugu, Woovi, Efí, BTG.

**Conclusão:** o caminho de menor risco não é Mercado Pago — é levar o PIX recorrente para dentro do Stripe, que já é nosso gateway de cartão, já tem os preços, os webhooks, o dunning e o portal funcionando.

## Objetivo

1. Parar de vender PIX quebrado enquanto o Asaas está bloqueado.
2. Reconstruir o PIX recorrente no Stripe, mantendo a regra comercial atual: **1ª semana R$ 6,90 e depois o valor mensal cobrado automaticamente**.
3. Manter o Asaas apenas para os assinantes PIX que já existem, sem novas vendas por lá.

## Fase 0 — Fechar a torneira (hoje, independente do resto)

- Criar `asaas-health-check`: chama um endpoint operacional do Asaas, classifica `ok | blocked | invalid` e grava em `system_config` (`asaas_operational_status`).
- Cron de 15 min atualizando esse status.
- `CheckoutV2.tsx` lê o status: com `blocked`, o botão PIX sai da UI (ou vira "PIX temporariamente indisponível") em vez de gerar um QR que nunca nasce.
- Alerta no admin quando o status muda.

Isso é o item que para o vazamento de conversão agora.

## Fase 1 — Habilitar Pix no Stripe (ação sua, no painel)

Pré-requisito bloqueante para as fases seguintes: ativar **Pix** e **Pix Automático** em Configurações → Métodos de pagamento do Stripe. Vou confirmar por API quando a capability `pix_payments` aparecer como `active`.

## Fase 2 — Assinatura PIX no Stripe com a 1ª semana a R$ 6,90

Reaproveita exatamente a mecânica que já usamos no cartão:

- `create-checkout` passa a aceitar `paymentMethod: 'pix'` e cria uma Subscription com `payment_method_types: ['pix']`.
- Mandato configurado via `payment_method_options[pix][mandate_options]`:
  - `amount` = teto do ciclo (valor mensal do plano com folga para reajuste), `amount_type: maximum`;
  - `payment_schedule: monthly`;
  - `reference` = nome do plano que aparece no app do banco;
  - `amount_includes_iof` definido de forma explícita (quem paga o IOF).
- Semana promocional: mesma estrutura do cartão — primeiro ciclo de 7 dias a R$ 6,90 e, no fim dele, o Stripe cobra o valor mensal cheio pelo mandato já autorizado.
- Ciclos longos (Tri/Sem/Anual) entram com o `payment_schedule` correspondente, sem trial.

## Fase 3 — Webhook e estado da assinatura

- `stripe-webhook` passa a tratar os estados específicos de Pix: pagamento em `processing` (janela de 3 dias da pré-notificação), `succeeded`, `failed` e mandato cancelado pelo cliente no banco.
- `processing` **não** pode ser tratado como inadimplência: acesso mantido, dunning silenciado durante a janela.
- Mandato revogado no app do banco → entra no fluxo de reautorização que já existe (`/reautorizar-pix`), apontando agora para o Stripe.
- `profiles` ganha a marcação de qual trilho o assinante usa (`stripe_card`, `stripe_pix`, `asaas_pix_legacy`), para o dunning e o portal decidirem o link certo.

## Fase 4 — Dunning e portal

- A cadência de 2 avisos + escada de ofertas passa a reconhecer `stripe_pix`, usando o link do Stripe (invoice hospedada / portal) em vez do QR do Asaas.
- `customer-portal` roteia `stripe_pix` para o portal do Stripe, onde o cliente vê e cancela o mandato.
- Asaas legado continua com a cadência atual até a base migrar.

## Fase 5 — Migração da base PIX do Asaas

- Campanha por WhatsApp para os assinantes PIX ativos do Asaas: link único que cria o mandato no Stripe.
- Só depois que o cliente autoriza no Stripe é que a assinatura Asaas é encerrada — nunca antes, para não abrir buraco de cobrança.
- Painel admin com o placar da migração (autorizados / pendentes / falhos).

## Detalhes técnicos

- Arquivos afetados: `supabase/functions/create-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/customer-portal/index.ts`, `supabase/functions/_shared/dunning-whatsapp.ts`, `src/pages/CheckoutV2.tsx`, novo `supabase/functions/asaas-health-check/index.ts`.
- Nada de camada de abstração multi-gateway agora: Stripe cobre cartão e PIX, e o Asaas fica em modo somente-leitura/legado. Menos código, menos superfície de erro.
- Mercado Pago fica fora do escopo até existir documentação pública de Pix Automático.
- O Asaas continua valendo uma cobrança administrativa em paralelo (a conta segue com saldo de R$ 289,29 preso e as chaves Pix removidas), mas isso não bloqueia mais a operação.

## Ordem de execução

Fase 0 → você habilita o Pix no Stripe (Fase 1) → Fases 2 e 3 → Fase 4 → Fase 5.
