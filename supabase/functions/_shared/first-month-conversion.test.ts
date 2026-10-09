import { expect, test } from 'bun:test';
import { conversionCohort, pixFirstDue, stripeFirstMonths } from './first-month-conversion';

test('cancelados permanecem, semanas futuras saem e pagamento tardio fica na coorte original', () => {
  const result = conversionCohort([
    { id: 'a', identity: 'a', provider: 'stripe', due: '2026-10-01', paid: '2026-10-07' },
    { id: 'b', identity: 'b', provider: 'woovi', due: '2026-10-02', paid: null },
    { id: 'c', identity: 'c', provider: 'woovi', due: '2026-10-12', paid: null },
    { id: 'a2', identity: 'a', provider: 'stripe', due: '2026-10-01', paid: '2026-10-07' },
  ], '2026-10-01', '2026-10-31', '2026-10-08');
  expect(result.expected).toBe(2); expect(result.converted).toBe(1); expect(result.rate).toBe(50);
});
test('primeira parcela inclui canceladas e não usa próximo vencimento de renovação', () => {
  expect(pixFirstDue('2026-09-01', [{ value: 690, dueDate: '2026-09-01' }, { value: 2990, dueDate: '2026-09-08', status: 'CANCELLED' }, { value: 2990, dueDate: '2026-10-08' }], 690, 8)).toBe('2026-09-08');
  expect(pixFirstDue('2026-09-01', [], 690, 8)).toBe('2026-09-08');
  expect(pixFirstDue('2026-09-01', [], 690, 1)).toBeNull();
});
test('cartão exige semana paga e conta somente fatura do primeiro ciclo, não renovação', () => {
  const start = Date.parse('2026-09-01T15:00:00Z') / 1000, end = start + 7 * 86400;
  const sub = { id: 's', customer: 'c', trial_start: start, trial_end: end, metadata: { trial: 'true', email: 'a@b.com' }, items: { data: [{ price: { recurring: { interval: 'month', interval_count: 1 } } }] } };
  const pi = { customer: 'c', status: 'succeeded', amount_received: 690, created: start - 1, metadata: { trial: 'true' } };
  const invoice = { parent: { subscription_details: { subscription: 's' } }, billing_reason: 'subscription_cycle', amount_due: 2990, amount_paid: 2990, status: 'paid', status_transitions: { paid_at: end + 86400 }, lines: { data: [{ period: { start: end } }] } };
  expect(stripeFirstMonths([sub], [pi], [invoice], new Set()).cohorts[0]?.paid).toBe('2026-09-09');
  expect(stripeFirstMonths([sub], [], [invoice], new Set()).cohorts.length).toBe(0);
  expect(stripeFirstMonths([sub], [pi], [{ ...invoice, lines: { data: [{ period: { start: end + 30 * 86400 } }] } }], new Set()).cohorts[0]?.paid).toBeNull();
  expect(stripeFirstMonths([sub], [pi], [invoice], new Set(['a@b.com'])).cohorts.length).toBe(0);
  expect(stripeFirstMonths([sub], [pi], [{ ...invoice, billing_reason: 'subscription_update', amount_due: 430, amount_paid: 430 }], new Set()).cohorts[0]?.paid).toBeNull();
  for (const proration of [{ proration: true }, { parent: { subscription_item_details: { proration: true } } }]) {
    expect(stripeFirstMonths([sub], [pi], [{ ...invoice, lines: { data: [{ period: { start: end }, ...proration }] } }], new Set()).cohorts[0]?.paid).toBeNull();
  }
});