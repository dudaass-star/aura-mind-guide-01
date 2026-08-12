---
name: Recuperação silenciosa 30d (PIX Automático Woovi)
description: Ciclo Woovi não pago não gera aviso nem corte; recicla parcela 4x/7d por ~30 dias e só depois oferta 30% off → Lite com QR novo
type: feature
---
Falha de ciclo no PIX Automático (Woovi) NÃO envia aviso de falha e NÃO corta acesso — no PIX o cliente derruba o mandato com um clique no app do banco. Paridade com o cartão, que fica ~21 dias liberado durante os Smart Retries.

Fluxo:
1. Webhook (`webhook-woovi`) registra a cobrança e agenda `woovi_cycle_recycle` (nada de `payment_failed_at`). Status com `TRY_REJECTED`/`COBR_TRY` = tentativa intermediária da Woovi, só loga.
2. `execute-scheduled-tasks` recicla a MESMA parcela a cada 7 dias, até 4x (~30 dias), via `POST /api/v1/installments/{id}/cobr/retry` (parcela vem de `GET /api/v1/subscriptions/{id}/installments`). Pagamento no meio cancela toda a cadência.
3. Só ao fim: `woovi_recovery_offer` (noticeSteps=0) → 30% off, e D+3 → Lite. `woovi_recovery_final` em D+4 cancela o mandato e marca inadimplência.

Oferta aceita gera MANDATO NOVO já no valor reduzido (`criar-pix-recorrente-woovi` com `mode:"offer"` + `offer`), entregue como QR em `/reautorizar-pix?token=..&offer=tier` — o cliente pode pagar de outra conta. `plan_tier` (lite=1990, base=990, mensal) é ajustado na aprovação do mandato.