# Woovi PIX Automático — o que falta para fechar o trilho

## Resposta curta

**Dunning para Woovi: não implementado.** O helper de dunning (`sendDunningWhatsApp`) aceita apenas `provider: "stripe" | "asaas"`, e o `webhook-woovi` só marca `payment_failed_at` quando o mandato é revogado — não existe cadência de avisos (2 avisos → 30% → Lite) para falha de ciclo no Woovi. Toda a escada de retenção hoje é acionada por Stripe (webhook) e Asaas (webhook + `dunning_pix_followup`); Inter marca a falha mas também não tem cadência própria.

## O que já está pronto no Woovi

- Criação do trilho composto (entrada avulsa + mandato fixo) e QR único validado em BB e Nubank
- Webhook: ciclo de vida do mandato (aprovado/rejeitado/cancelado), cobrança liquidada, ativação/renovação de acesso, Meta CAPI, idempotência por `event_key`
- Observabilidade: `entry_paid_at`, `mandate_approved_at`, `payer_bank`, `creation_mode`
- Auditoria a cada 15 min: nudge de conclusão parcial, replay de webhook perdido, cancelamento de QR abandonado
- Health gate (`asaas-health-check` cobre Woovi) e seleção de trilho no checkout

## Lacunas a fechar

### 1. Dunning de ciclo (P0)
Ciclo mensal não pago no Woovi hoje não gera nenhuma comunicação.
- Estender `_shared/dunning-whatsapp.ts` para aceitar `provider: "woovi"` (e `"inter"`), reaproveitando a mesma escada: aviso 1, aviso 2, 30% off, Lite
- Tratar no `webhook-woovi` os eventos de cobrança **não paga/expirada** de ciclo (hoje só o caminho "pago" existe): marcar `payment_failed_at`, gravar `dunning_attempts` e disparar o aviso 1
- Agendar a cadência via `scheduled_tasks` com um `task_type` genérico (`dunning_pix_followup` com `provider` no payload, em vez de hardcode Asaas) — D+2, D+4, D+7
- No executor, checar pagamento na API da Woovi antes de cada passo e cancelar a cadência se já liquidou

### 2. Retentativa de cobrança do ciclo (P0)
Definir se o Woovi retenta o débito do mandato sozinho ou se precisamos de um runner como o do Inter (3R/7D). Confirmar no contrato da API antes de codar; se não retentar, criar `woovi-pix-cycle-runner` espelhando `inter-pix-cycle-runner`.

### 3. Cancelamento e troca de plano (P1)
`cancel-subscription` trata Stripe, Asaas e Inter — não trata Woovi: cancelar o mandato na Woovi, gravar evento de retenção e liberar o acesso até o fim do ciclo. `change-subscription-plan` também não cobre Woovi (troca de plano exige novo mandato + cancelamento do antigo, com `replaced_by_subscription_id`).

### 4. Portal do usuário (P1)
"Atualizar forma de pagamento" e a aba de assinatura precisam reconhecer mandato Woovi (mostrar valor, próximo débito, banco pagador e caminho de reautorização quando o mandato foi revogado no app do banco).

### 5. Reautorização por churn silencioso (P1)
Mandato revogado hoje só marca a falha. Falta o fluxo de reautorização: gerar novo QR de mandato e enviar via WhatsApp/e-mail, como já existe no Asaas.

### 6. Rollout (P2)
Definir critério para `pix_rail_status` apontar `woovi` como trilho padrão: N pagamentos reais confirmados (entrada + 1º ciclo) e taxa de conclusão parcial dentro do aceitável por banco.

## Ordem sugerida

1. Confirmar contrato de retentativa/cobrança de ciclo da Woovi (leitura de docs + 1 chamada de API)
2. Dunning multi-gateway (`provider: "woovi"`) + gatilho de ciclo não pago no webhook + cadência agendada
3. Cycle runner, se necessário
4. Cancelamento, troca de plano e portal
5. Reautorização de mandato revogado
6. Rollout gradual do trilho

## Detalhes técnicos

- `_shared/dunning-whatsapp.ts`: alargar o union de `provider` e o link do gateway; templates Twilio permanecem os mesmos (`discount_30`, `lite`)
- `execute-scheduled-tasks`: generalizar `dunning_pix_followup` para consultar Asaas **ou** Woovi conforme `payload.provider`
- `webhook-woovi`: novo bloco de cobrança não liquidada, distinguindo entrada (recuperação de checkout) de ciclo (dunning) via `kind`/`entry_charge_correlation_id`
- `woovi_subscriptions`: reaproveitar `last_error`/`status` para estado de dunning; sem novas tabelas
