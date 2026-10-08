import { expect, test } from 'bun:test';
import { addMonths, cycleMonths, pixContract, reconcileRevenue } from './recurring-revenue';
test('ciclos e último dia do mês', () => {
  expect(cycleMonths('semestral')).toBe(6);
  expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
});
test('perfil antigo vinculado pelo id e pagamento sem entrada', () => {
  const c = pixContract('woovi', { subscription_id: 's', user_id: 'p', billing_period: 'monthly', value_cents: 2990 }, [{ status: 'COMPLETED', paid_at: '2026-10-02', due_date: '2026-10-01', value_cents: 2990 }], '2026-10-08');
  const result = reconcileRevenue([{ id: 'p', user_id: 'auth', status: 'active' }], [c], '2026-10-08');
  expect(result.recurring.brl).toBe(29.9);
  expect(result.activeBreakdown.recurring).toBe(1);
});
test('semana e atrasados nunca inflam recorrência', () => {
  const profiles = [{ id: 'p', status: 'active' }, { id: 'q', status: 'active' }];
  const result = reconcileRevenue(profiles, [{ id: 's', userId: 'p', provider: 'woovi', monthlyCents: 2990, trialPaid: true, trialUntil: '2026-10-10' }, { id: 't', userId: 'q', provider: 'stripe', monthlyCents: 4990, paidBefore: true, paidUntil: '2026-10-01' }], '2026-10-08');
  expect(result.recurring.brl).toBe(0);
  expect(result.trial.brl).toBe(29.9);
  expect(result.risk.brl).toBe(49.9);
});
test('duplicidade não soma silenciosamente e demo excluído', () => {
  const result = reconcileRevenue([{ id: 'p', status: 'active' }, { id: 'd', status: 'demo' }], ['a', 'b'].map(id => ({ id, userId: 'p', monthlyCents: 2990, paidUntil: '2026-11-01' })).concat([{ id: 'demo', userId: 'd', monthlyCents: 2990, paidUntil: '2026-11-01' }]), '2026-10-08');
  expect(result.recurring.contracts).toBe(0);
  expect(result.unverified.contracts).toBe(2);
});