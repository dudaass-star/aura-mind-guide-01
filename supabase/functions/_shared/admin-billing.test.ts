import { describe, test, expect } from 'bun:test';
import { brtDay, validDay, monthlyCents, mergeBilling, billingTotals, type BillingEntry } from './admin-billing';

describe('Critérios financeiros administrativos', () => {
  test('normaliza ciclos sem depender do ID do preço', () => {
    expect(monthlyCents(8970, 'month', 3)).toBe(2990);
    expect(monthlyCents(17940, 'month', 6)).toBe(2990);
    expect(monthlyCents(35880, 'year')).toBe(2990);
  });
  test('respeita a virada do dia em Brasília', () => {
    expect(brtDay('2026-10-02T02:59:59Z')).toBe('2026-10-01');
    expect(brtDay('2026-10-02T03:00:00Z')).toBe('2026-10-02');
    expect(validDay('2026-02-30')).toBe(false);
  });
  test('não apaga pagamento ao receber uma retentativa', () => {
    const entries = new Map<string, BillingEntry>();
    mergeBilling(entries, { id: 'parcela', provider: 'woovi', due: null, paid: '2026-10-01', cents: 2990 });
    mergeBilling(entries, { id: 'parcela', provider: 'woovi', due: '2026-09-30', paid: null, cents: 2990 });
    expect(entries.size).toBe(1);
    expect(entries.get('parcela')?.paid).toBe('2026-10-01');
    expect(billingTotals([...entries.values()], '2026-10-01', '2026-10-04', '2026-10-08').received).toBe(1);
  });
  test('separa recebimento tardio e vencimento de hoje', () => {
    const totals = billingTotals([
      { id: 'antiga', provider: 'stripe', due: '2026-09-30', paid: '2026-10-01', cents: 2990 },
      { id: 'hoje', provider: 'woovi', due: '2026-10-08', paid: null, cents: 4990 },
    ], '2026-10-01', '2026-10-08', '2026-10-08');
    expect(totals.expected).toBe(1);
    expect(totals.received).toBe(1);
    expect(totals.overdue).toBe(0);
    expect(totals.receivedCents).toBe(2990);
  });
});