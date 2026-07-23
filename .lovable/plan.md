
# Plano — Escada de Retenção (Save Offer + Win-back + Dunning WhatsApp)

## Objetivo
Reduzir churn atacando cancelamento consciente e churn silencioso (past_due). Escada de 4 degraus roteada por motivo no cancel flow, reaproveitada no dunning via WhatsApp + email.

## Gateways contemplados
Toda ação de pagamento cobre os **3 gateways ativos** do projeto:
- **Stripe cartão** (hoje canônico pra cartão)
- **Asaas cartão** (paridade total com Stripe — provável substituto do Stripe no futuro)
- **Asaas PIX recorrente** (`/subscriptions` cycle MONTHLY)

Detecção do gateway do cliente segue o padrão já usado em `change-subscription-plan` e `customer-portal`: lê `profiles.payment_gateway` (`stripe` | `asaas_card` | `asaas_pix`) e roteia. Toda ação nova (`apply_discount_3m`, `downgrade_to_lite`, `downgrade_to_base`) tem implementação para os 3.

## Escada final

```text
Cancel flow → motivo declarado
├── "não tô usando agora" / fase corrida    → Pausar 30/60/90d
├── "tá caro" / motivo econômico            → 30% off por 3 meses no plano atual
│    └── recusou                             → Plano Lite R$19,90
│         └── recusou                        → Plano Base R$9,90 ("não perca seu histórico")
└── "não gostei" / "não é pra mim"          → cancela direto, sem save (preserva NPS)

Churn silencioso (past_due, sem clicar em cancelar):
D+1  → recuperar cartão (sem oferta)              [WhatsApp + Email]
D+7  → 30% off por 3 meses                        [WhatsApp + Email]
D+14 → oferta Lite R$19,90                         [WhatsApp + Email]
D+30 (pós-cancel) → Base R$9,90 + "não perca histórico"  [WhatsApp + Email]
```

## Escopo enxuto (o que ENTRA nesta implementação)

### Fase 1 — Planos Lite e Base nos 3 gateways
- Criar preços `lite_monthly` (R$19,90) e `base_monthly` (R$9,90) no **Stripe** (2 prices) e no **Asaas** (via API `/subscriptions` cycle MONTHLY com `value` correspondente, para cartão e PIX).
- Salvar como constantes em:
  - `supabase/functions/create-checkout/index.ts` (Stripe)
  - `supabase/functions/criar-cartao-asaas/index.ts` (Asaas cartão)
  - `supabase/functions/criar-pix-recorrente-asaas/index.ts` (Asaas PIX)
- Adicionar coluna `profiles.plan_tier` (`essencial | direcao | transformacao | lite | base`) via migration. Novos planos NÃO aparecem em `Pricing.tsx` / `PricingV2.tsx` / popup / hero.

> Sem travas de custo e sem nudge de upgrade nesta fase (ficam pra depois, conforme sua decisão).

### Fase 2 — Cancel flow com roteamento por motivo

**2.1 Frontend `CancelSubscription.tsx`**
- Adicionar **Value Recap** antes da tela de motivo: puxa `thematic_snapshots` + contagem de sessões e mostra "Nos últimos X meses…" (impacto emocional pré-oferta).
- Trocar botão único "Pausar 30 dias" por seletor 30/60/90.
- Após seleção do motivo, roteamento determinístico para tela de oferta específica:
  - `nao_uso` / `fase_corrida` → Pausar (30/60/90)
  - `caro` / `financeiro` → **30% off 3 meses** → se recusa → **Lite R$19,90** → se recusa → **Base R$9,90**
  - `nao_gostei` / `metodologia` → cancela direto (sem save)
  - `outro` → oferece só Pausar (neutro)

**2.2 Backend `supabase/functions/cancel-subscription/index.ts`** — novas actions, cada uma com branch pros 3 gateways:
- `action: "apply_discount_3m"`
  - Stripe: aplica coupon 30% off `duration=repeating, duration_in_months=3` na subscription.
  - Asaas cartão / PIX: cria novo `/subscriptions` com `value` = preço × 0.7 por 3 ciclos + agenda `scheduled_task` para restaurar valor cheio no 4º ciclo (Asaas não tem cupom nativo com duração limitada — é workaround, mas contido).
- `action: "downgrade_to_lite"` e `action: "downgrade_to_base"`
  - Stripe: `subscriptions.update` trocando o `price` (prorate `none`, mesmo padrão de `change-subscription-plan`).
  - Asaas cartão / PIX: cancela subscription atual + cria nova com o `value` do Lite/Base mantendo o mesmo `customer` (padrão de `change-asaas-plan`).
- Todas registram em `cancellation_feedback` novos campos `save_offer_accepted (bool)`, `save_tier (text)`, `gateway (text)`.

**2.3 Trava anti-abuso**
- Cupom 30% off: 1x por cliente a cada 12 meses (checa `cancellation_feedback.save_tier = 'discount_30'`).
- Downgrade Lite/Base: sem cooldown, mas cliente rebaixado não pode acessar Semanal (regra existente "1ª compra" já bloqueia).

### Fase 3 — Dunning WhatsApp + Email (churn silencioso)

**3.1 Extensão do `reprocess-dunning` + novo cron `dunning-scheduler`**
- Hoje o dunning é só email. Adicionar canal WhatsApp em paralelo (é onde converte).
- Novas colunas em `dunning_attempts`: `channel (email|whatsapp)` e `offer_tier (recover_card|discount_30|lite|base)`.
- Cron a cada 6h checa `stripe_subscription_status = 'past_due'` (Stripe) e `asaas_payment_status IN ('OVERDUE')` (Asaas) e dispara o degrau correspondente por dias em atraso.

**3.2 Deep-link de aceite unificado**
- Rota `/retention/accept/:token` que resolve token curto em `short_links` (nova coluna `intent = 'retention_accept'` + `payload jsonb` com `{tier, user_id, gateway}`).
- Chama a mesma action correspondente em `cancel-subscription` (reuso total), depois redireciona pra `/obrigado` com headline específica.
- Token 7 dias, single-use.

**3.3 Templates WhatsApp (marcados como TODO — usuário criará depois)**
- 4 ContentSids Twilio (utility) a registrar em `whatsapp_templates`:
  - `dunning_d1_recover_card`
  - `dunning_d7_discount_30`
  - `dunning_d14_lite_offer`
  - `winback_d30_base_offer`
- Estratégia Teaser + Link (memória `proactive-messaging-teaser-strategy`): botão abre janela 24h, aí manda link curto (via `create-short-link`, `intent=retention_accept`).
- **Código já lê `whatsapp_templates.content_sid`; funciona no dia que você aprovar os SIDs na Meta. Enquanto isso, só o email dispara.**

**3.4 Emails paralelos**
- 4 templates reaproveitando `send-transactional-email` (padrão da memória `transactional-architecture`), com o mesmo `retention/accept/:token`.

### Fase 4 — Observabilidade mínima
- Nova tabela `retention_events` (id, user_id, tier, channel, action, accepted, gateway, created_at) para instrumentar tudo.
- 2 cards em `AdminEngagement`:
  - "Save offer aceito (30d)" — % de cancel_flow que virou pause/desconto/downgrade.
  - "Dunning recuperado por tier" — conversão de cada degrau.

## O que SAI de escopo (fica pra depois)
- Travas de custo por plano_tier (limites de áudio/mensagens/sessões).
- Nudge mensal de upgrade Lite/Base.
- Upgrade automático Base→Lite→Essencial baseado em uso.
- KPI "LTV Lite/Base" com taxa de upgrade em 90d.
- Refatoração maior do dunning existente.

## Ordem de rollout (garantindo "funciona sem 200 ajustes")

1. **Migration** (`plan_tier`, `retention_events`, colunas em `dunning_attempts` e `short_links`, novos campos em `cancellation_feedback`).
2. **Criar prices Stripe** (Lite e Base) via API — resultado em constantes no código.
3. **Fase 1** (constantes de preço nos 3 gateways).
4. **Fase 2** (cancel flow completo, 3 gateways, com Value Recap + roteamento) — release e valida em produção por 1-2 semanas.
5. **Fase 3** (dunning: código pronto pros 4 templates + emails ativos + WhatsApp aguardando ContentSid).
6. **Fase 4** (KPIs + `retention_events`) em paralelo com Fase 2.

## Dependências que precisam do usuário
- Aprovar 4 templates WhatsApp na Meta (só depois deles a parte WhatsApp do dunning ativa; email dispara desde o dia 1).
- Confirmar nomes finais dos planos ("Aura Lite" / "Aura Base" ou outros).

## Riscos e mitigações
- **Paridade Stripe ↔ Asaas cartão ↔ Asaas PIX**: todo teste manual pós-deploy roda os 3 fluxos (cupom, downgrade Lite, downgrade Base) num usuário de teste por gateway.
- **Cupom 30% no Asaas** (não tem duração nativa): workaround com `scheduled_task` restaurando valor cheio no 4º ciclo — testado antes do release.
- **Templates Meta rejeitados**: email cobre desde o dia 1; WhatsApp entra quando aprovado, sem bloquear release.
- **Sem canibalização**: Lite e Base só existem no cancel flow e dunning; nunca em UI pública.
