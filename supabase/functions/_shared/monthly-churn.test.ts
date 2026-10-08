import { expect, test } from 'bun:test';
import { monthlyChurn, churnSources } from './monthly-churn';

test('churn usa pessoas da base inicial e não novas entradas no mês', () => {
  const data = monthlyChurn([
    { identity: 'a', start: '2026-08-01', end: '2026-09-15', cause: 'voluntary' },
    { identity: 'b', start: '2026-08-15', end: null, cause: 'unknown' },
    { identity: 'c', start: '2026-09-05', end: '2026-09-20', cause: 'involuntary' },
  ], '2026-10-08');
  expect(data).toHaveLength(12);
  expect(data.find(m => m.month === '2026-09')).toMatchObject({ base: 2, lost: 1, rate: 50, voluntary: 1 });
  expect(data[0].status).toBe('no_history');
  expect(data[11].status).toBe('current');
});
test('troca de contrato e duplicidade não viram churn; saída na virada conta no novo mês', () => {
  const data = monthlyChurn([
    { identity: 'a', start: '2026-08-01', end: '2026-09-10', cause: 'voluntary' },
    { identity: 'a', start: '2026-09-10', end: null, cause: 'unknown' },
    { identity: 'b', start: '2026-08-01', end: '2026-10-01', cause: 'involuntary' },
  ], '2026-10-08');
  expect(data[10]).toMatchObject({ base: 2, lost: 0, rate: 0 });
  expect(data[11]).toMatchObject({ base: 2, lost: 1, involuntary: 1, rate: 50 });
});
test('semana paga entra na base e cancelamento futuro não vira perda antecipada', () => {
  const profiles = [{ id: 'a', user_id: 'u', email: 'a@b.c' }];
  const source = churnSources(profiles, { subscriptions: [], invoices: [] }, [{ provider: 'woovi', subscriptions: [{ subscription_id: 's', user_id: 'u', billing_period: 'monthly', is_trial: true, trial_value_cents: 690 }], charges: [{ subscription_id: 's', status: 'COMPLETED', kind: 'entry', value_cents: 690, paid_at: '2026-08-01T12:00:00Z' }] }], []);
  expect(source.intervals).toHaveLength(1);
  expect(source.intervals[0]?.recurringStart).toBeNull();
  const month = monthlyChurn([{ identity: 'a', start: '2026-08-01', end: '2026-10-20', cause: 'voluntary' }], '2026-10-08')[11];
  expect(month).toMatchObject({ base: 1, lost: 0 });
});
test('PIX usa cancelamento comprovado e fim pago, nunca updated_at', () => {
  const subscriptions = [{ subscription_id: 's', user_id: 'u', billing_period: 'monthly', status: 'CANCELADA', updated_at: '2026-10-08T12:00:00Z' }];
  const charges = [{ subscription_id: 's', status: 'COMPLETED', due_date: '2026-08-15', paid_at: '2026-08-15T12:00:00Z' }];
  const profiles = [{ id: 'a', user_id: 'u' }];
  expect(churnSources(profiles, { subscriptions: [] }, [{ provider: 'woovi', subscriptions, charges }], []).excluded.missingEnd).toBe(1);
  const result = churnSources(profiles, { subscriptions: [] }, [{ provider: 'woovi', subscriptions, charges }], [{ tier: 'cancel', action: 'applied', metadata: { subscription_id: 's' }, created_at: '2026-09-02T12:00:00Z' }]);
  expect(result.intervals[0]).toMatchObject({ start: '2026-08-15', end: '2026-09-15', cause: 'voluntary' });
});
test('cliente histórico removido mantém identidade exata de cobrança entre provedores', () => {
  const source = churnSources([], { subscriptions: [] }, [{ provider: 'woovi', subscriptions: [{ subscription_id: 's', customer_email: 'Antiga@example.com', billing_period: 'monthly', status: 'ATIVA' }], charges: [{ subscription_id: 's', paid_at: '2026-08-01T12:00:00Z', status: 'COMPLETED' }] }], []);
  expect(source.intervals[0]?.identity).toBe('email:antiga@example.com');
  expect(source.excluded.missingIdentity).toBe(0);
});
 test('semana paga na base, conversão sem duplicidade e perdas por etapa', () => {
   const m = monthlyChurn([
     { identity: 'semana', start: '2026-09-28', end: '2026-10-05', cause: 'unknown', recurringStart: null },
     { identity: 'converteu', start: '2026-09-28', end: '2026-10-05', cause: 'unknown', recurringStart: null },
     { identity: 'converteu', start: '2026-10-05', end: null, cause: 'unknown', recurringStart: '2026-10-05' },
     { identity: 'mensal', start: '2026-08-01', end: '2026-10-04', cause: 'voluntary' },
   ], '2026-10-08')[11];
   expect(m).toMatchObject({ base: 3, trialBase: 2, recurringBase: 1, lost: 2, trialLost: 1, recurringLost: 1 });
 });
 test('fim incerto preserva cobertura histórica e não inventa perda ou taxa', () => {
   const data = monthlyChurn([{ identity: 'a', start: '2026-08-15', end: '2026-09-15', cause: 'unknown', endUncertain: true }], '2026-10-08');
   expect(data[10]).toMatchObject({ base: 1, lost: 0, rate: null, uncertain: 1 });
   expect(data[11]).toMatchObject({ base: 0, rate: null, uncertain: 1 });
 });
 test('cartão inclui semana paga vinculada', () => {
   const source = churnSources([{ id: 'a', email: 'a@b.c' }], {
     subscriptions: [{ id: 's', customer: 'cus', metadata: { email: 'a@b.c', trial: 'true' }, trial_start: 1790607600, trial_end: 1791212400, status: 'trialing', items: { data: [{ price: { recurring: { interval: 'month' } } }] } }],
     invoices: [], weeklyPayments: [{ id: 'pi', customer: 'cus', created: 1790607590, status: 'succeeded', amount_received: 690, metadata: { trial: 'true' } }],
   }, [], []);
   expect(source.intervals).toHaveLength(1);
   expect(source.intervals[0]?.recurringStart).toBeNull();
   expect(monthlyChurn(source.intervals, '2026-10-01')[11].trialBase).toBe(1);
 });
test('evento oficial do mandato fecha semana paga sem inventar updated_at', () => {
  const subs = [{ subscription_id: 's', user_id: 'u', billing_period: 'monthly', status: 'REJEITADA', is_trial: true, entry_paid_at: '2026-09-28T12:00:00Z', updated_at: '2026-10-08T12:00:00Z' }];
  const events = [{ payload: { globalID: 's', event: 'PIX_AUTOMATIC_REJECTED', pixRecurring: { status: 'REJECTED' } }, created_at: '2026-09-29T12:00:00Z' }];
  const source = churnSources([{ id: 'a', user_id: 'u' }], { subscriptions: [] }, [{ provider: 'woovi', subscriptions: subs, charges: [] }], [], events);
  expect(source.excluded.missingEnd).toBe(0);
  expect(source.intervals[0]).toMatchObject({ start: '2026-09-28', end: '2026-10-05', endUncertain: false });
  expect(monthlyChurn(source.intervals, '2026-10-08')[11]).toMatchObject({ base: 1, lost: 1, trialLost: 1, rate: 100 });
  const other = churnSources([{ id: 'a', user_id: 'u' }], { subscriptions: [] }, [{ provider: 'woovi', subscriptions: subs, charges: [] }], [], [{ ...events[0], payload: { ...events[0].payload, globalID: 'outro' } }]);
  expect(other.excluded.missingEnd).toBe(1);
});
test('evento rejeitado sem status terminal e cobertura incompleta não validam taxa', () => {
  const source = churnSources([{ id: 'a', user_id: 'u' }], { subscriptions: [] }, [{ provider: 'woovi', subscriptions: [{ subscription_id: 's', user_id: 'u', billing_period: 'monthly', status: 'CANCELADA' }], charges: [{ subscription_id: 's', paid_at: '2026-09-01T12:00:00Z', status: 'COMPLETED' }] }], [], [{ payload: { globalID: 's', event: 'PIX_AUTOMATIC_REJECTED', pixRecurring: { status: 'CREATED' } }, created_at: '2026-09-02T12:00:00Z' }]);
  expect(source.excluded.missingEnd).toBe(1);
});
test('contratos sem identificador não recebem pagamentos órfãos', () => {
  const result = churnSources([{ id: 'a', user_id: 'u' }], { subscriptions: [] }, [{ provider: 'woovi', subscriptions: [{ user_id: 'u', billing_period: 'monthly' }], charges: [{ status: 'COMPLETED', paid_at: '2026-08-01T12:00:00Z' }] }], []);
  expect(result.intervals).toHaveLength(0);
  expect(result.excluded.invalidHistory).toBe(1);
});
test('outro contrato ainda vigente impede churn por cancelamento de um contrato sobreposto', () => {
  const month = monthlyChurn([
    { identity: 'a', start: '2026-07-01', end: null, cause: 'unknown' },
    { identity: 'a', start: '2026-07-15', end: '2026-08-10', cause: 'voluntary' },
  ], '2026-10-08')[11];
  expect(month).toMatchObject({ base: 1, lost: 0, rate: 0 });
});
