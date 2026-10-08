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
test('cancelamento futuro, semana sem conversão e demonstração ficam fora das perdas', () => {
  const profiles = [{ id: 'a', user_id: 'u', email: 'a@b.c' }];
  const source = churnSources(profiles, { subscriptions: [], invoices: [] }, [{ provider: 'woovi', subscriptions: [{ subscription_id: 's', user_id: 'u', billing_period: 'monthly', is_trial: true, trial_value_cents: 690 }], charges: [{ subscription_id: 's', status: 'COMPLETED', kind: 'entry', value_cents: 690, paid_at: '2026-08-01T12:00:00Z' }] }], []);
  expect(source.intervals).toHaveLength(0);
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