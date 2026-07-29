## Situação verificada (dados reais)

Cliente: **Jenoelma Barboza — elmaricardorosa@gmail.com** (o e-mail do ticket, `elmaricardo.rosa@gmail.com`, tem um ponto a mais; o cadastro real é sem o ponto).

Ela fez **3 checkouts no mesmo dia 03/04/2026**, dos quais **2 foram concluídos** — e isso gerou **dois clientes distintos na Stripe, cada um com sua própria assinatura**:

| Customer | Assinatura | Status | Observação |
|---|---|---|---|
| `cus_UGh5Hrbj1eeR38` | `sub_1TI9lw...` | **cancelada** (16/04/2026, "cancellation_requested") | é esta que ela cancelou |
| `cus_UGflbMcLkR7wM8` | `sub_1TI8R1...` | **ATIVA**, R$ 29,90/mês | nunca foi cancelada — continua cobrando |

Cobranças confirmadas na assinatura ativa (Visa •9486), todas sem reembolso: **10/07/2026 R$ 29,90**, **06/06/2026 R$ 29,90** e as anteriores do mesmo ciclo mensal desde abril.

Não existe perfil dela em `profiles` (o cadastro foi removido/limpo), então nem o portal nem o fluxo de cancelamento enxergavam a segunda assinatura. Existe ticket aberto: "Cobrança", categoria `reembolso`, 28/07/2026, `pending_review`.

**Conclusão: a reclamação procede.** Ela cancelou uma assinatura e a segunda, duplicada, seguiu cobrando.

## Resolução do caso

1. Cancelar imediatamente `sub_1TI8R1QU15XnZ7VvdI1j3ZID` (sem prorata, sem fatura final).
2. Levantar a lista exata de charges pagos dessa assinatura e reembolsar integralmente todos os ciclos posteriores ao cancelamento da primeira (16/04/2026) — pelos dados já lidos, no mínimo os de maio, junho e 10/07.
3. Responder o ticket `6454c0d4` explicando o ocorrido (cobrança duplicada por dois checkouts no mesmo dia), confirmando cancelamento + reembolsos e o prazo de estorno no cartão, e fechar o ticket.

## Prevenção (raiz do problema)

O `create-checkout` permite criar um segundo customer/subscription para o mesmo e-mail/telefone quando o usuário refaz o checkout minutos depois. Proposta:

- Em `supabase/functions/create-checkout/index.ts`: antes de criar a sessão, buscar customer por e-mail **e** por telefone e, se já existir subscription `active`/`trialing`, não abrir novo checkout — redirecionar para o portal/mensagem "você já tem assinatura ativa".
- No `stripe-webhook`, ao ativar um checkout: se o mesmo e-mail/telefone já tiver outra subscription ativa em customer diferente, cancelar automaticamente a mais recente duplicada e registrar log.
- Rodar uma varredura única (reaproveitando o padrão de `audit-stripe-duplicates`) para achar outros clientes com duas subscriptions ativas no mesmo e-mail/telefone e tratar antes que virem ticket.

## Detalhes técnicos

- Cancelamento e refunds via Stripe API (`DeleteSubscriptionsSubscription`, `PostRefunds`), com `human_confirmation` quando exigido.
- Reembolso registrado como `duplicate` no motivo do refund, para separar de churn real nas métricas.
- Nenhuma migração de banco necessária.

Confirme se quer que eu **cancele + reembolse todos os ciclos desde 16/04** (recomendado) ou apenas os últimos N meses.
