---
name: Woovi cobra a parcela vencida mais antiga
description: findUnpaidInstallment deve pegar a parcela vencida mais antiga; parcela futura nunca serve de ciclo corrente, e reconferência tem teto de 11 dias
type: feature
---

O mandato Woovi tem parcelas agendadas por meses. `findUnpaidInstallment`
(`supabase/functions/_shared/woovi.ts`) pegava a ÚLTIMA parcela em aberto — a mais
distante — e o débito do ciclo corrente saía contra uma parcela de 2027, com a
reconferência (`woovi_retry_confirm`) agendada para janeiro de 2027. Efeito real
em 09/09/2026: Gisele Pavan e Regina Coeli ficaram com mandato ativo e sem
cobrança do mensal, sem ninguém olhando.

Regras:
- `findUnpaidInstallment` filtra parcelas não pagas com vencimento `<= hoje BRT`
  (ou sem data) e devolve a MAIS ANTIGA.
- `scheduleWooviRetryConfirm` tem teto de 11 dias: veredito nunca é adiado por meses.
- Ciclo vencido sem cobrança cuja próxima parcela está a mais de 12 dias abre a
  régua de recuperação em 8 dias, além de garantir a CobR do ciclo seguinte.
- Silêncio/429 da Woovi continua sendo `WooviUnavailable`, nunca "não há parcela".
- Painel `PixAutomaticoDiaPanel` (aba Trial do admin de engajamento) mostra por dia:
  venceram, pagos, aguardando veredito, sem cobrança e autorização negada.
