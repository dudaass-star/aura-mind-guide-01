
# Checklist: PIX Automático Bacen na conta Asaas

Antes de mexer em código, precisamos confirmar que a conta Asaas tem PIX Automático Bacen liberado de verdade. Hoje o código usa só `/subscriptions` + `billingType: "PIX"` (recorrência com QR novo a cada ciclo, cliente paga manual) — **nada de PIX Automático Bacen implementado**.

## O que vou fazer

Uma única edge function temporária `asaas-check-pix-automatico` (interna, admin-only) que bate na API do Asaas e retorna um relatório do que está/não está disponível. Sem alterar nenhum fluxo existente.

### Verificações da API

1. **Endpoint disponível**: `GET /v3/pix/automatic/authorizations?limit=1` 
   - 200/empty list → habilitado
   - 401/403 → conta sem permissão
   - 404 → endpoint não liberado pra esse ambiente
2. **Ambiente**: confirma `ASAAS_ENV` (sandbox vs production) e mostra qual URL base foi consultada.
3. **Conta**: `GET /v3/myAccount` pra trazer nome, status de aprovação e país/CNPJ.
4. **Webhooks ativos**: `GET /v3/webhooks` pra listar quais eventos estão inscritos e checar se já tem `PIX_AUTOMATIC_*` (ou só os clássicos `PAYMENT_*`).
5. **Subscriptions existentes**: count rápido em `asaas_payments` agrupando por `billing_type` pra mostrar quantas assinaturas vivas hoje são `/subscriptions` PIX clássico (essas teriam que ser migradas depois).

### Entrega

- Edge function retorna JSON estruturado:
  ```
  {
    env: "production" | "sandbox",
    pixAutomatico: { available: boolean, status: 200|401|403|404, sample?: {...} },
    account: { name, status, country },
    webhooks: [{ url, events: [...], hasPixAutomatico: boolean }],
    legacySubscriptions: { active: number, byBilling: {...} }
  }
  ```
- Eu rodo a function 1x e te entrego o relatório no chat. Sem UI, sem migração, sem mudança no checkout/webhook atuais.

## Detalhes técnicos

- Nova função em `supabase/functions/asaas-check-pix-automatico/index.ts`.
- Usa `ASAAS_API_KEY` e `ASAAS_ENV` já existentes (não pede secret novo).
- `verify_jwt = false` padrão Lovable; protegida por `INTERNAL_WEBHOOK_SECRET` no header pra ninguém de fora invocar.
- Read-only: só `GET` na API do Asaas e `SELECT` no Supabase. Zero `POST`/`DELETE`/`UPDATE`.
- Não toca em `criar-pix-recorrente-asaas`, `webhook-asaas`, `change-asaas-plan`, nem no `ChangePlanDialog`.

## Próximo passo (depois deste checklist)

Com o resultado em mãos, a gente decide:
- Se PIX Automático estiver liberado → planejo a migração completa (`/subscriptions` → `/pix/automatic/authorizations`, novos eventos no webhook, UX de autorização no app do banco, plano de migração das subs antigas).
- Se não estiver → você abre solicitação no Asaas e a gente espera, mantendo o modelo atual.
