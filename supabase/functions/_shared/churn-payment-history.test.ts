import { expect, test } from 'bun:test';
import { churnPaymentHistory } from './churn-payment-history';

test('E2E oficial corrige contrato e vencimento sem inferir por cliente', () => {
  const subscriptions = [{ subscription_id: 'mensal' }, { subscription_id: 'anual' }];
  const charges = [{ subscription_id: 'anual', raw_payload: { pix: { endToEndId: 'E1' } } }];
  const snapshots = [{ id: 'mensal', provider: 'woovi', installments: [{ globalID: 'i1', status: 'COMPLETED', value: 2990, dateGenerateCharge: '2026-08-26T12:00:00Z', cobr: { endToEndId: 'E1', paymentDate: '2026-08-28T23:00:00Z' } }] }];
  expect(churnPaymentHistory('woovi', subscriptions, charges, snapshots)).toMatchObject([{ subscription_id: 'mensal', due_date: '2026-08-26', kind: 'cycle', value_cents: 2990 }]);
});
test('entrada original prevalece sobre cópia do extrato com E2E idêntico', () => {
  const subscriptions = [{ subscription_id: 'antigo', entry_charge_correlation_id: 'entrada' }, { subscription_id: 'novo' }];
  const charges = [
    { id: 'original', subscription_id: 'antigo', raw_payload: { charge: { correlationID: 'entrada' }, pix: { endToEndId: 'E1' } } },
    { id: 'copia', subscription_id: 'novo', raw_payload: { pix: { endToEndId: 'E1' } } },
  ];
  expect(churnPaymentHistory('woovi', subscriptions, charges, [])).toMatchObject([{ id: 'original', subscription_id: 'antigo' }]);
});
test('E2E ambíguo não reassocia pagamento', () => {
  const snapshots = ['a', 'b'].map(id => ({ id, provider: 'woovi', installments: [{ status: 'COMPLETED', dateGenerateCharge: '2026-08-26T12:00:00Z', cobr: { endToEndId: 'E1', paymentDate: '2026-08-28T23:00:00Z' } }] }));
  const charges = [{ subscription_id: 'c', raw_payload: { pix: { endToEndId: 'E1' } } }];
  expect(churnPaymentHistory('woovi', [{ subscription_id: 'a' }, { subscription_id: 'b' }], charges, snapshots)).toEqual(charges);
});
test('Asaas reconhece início imediato oficial, não pagamento posterior sem prova', () => {
  const subscriptions = [{ asaas_subscription_id: 's', start_date: '2026-07-02', value_cents: 2990, raw_payload: { subscriptionId: 's', originType: 'IMMEDIATE_PAYMENT_AND_RECURRING_QR_CODE' } }];
  const charges = ['2026-07-03T02:24:34Z', '2026-08-03T02:24:34Z'].map(paid_at => ({ asaas_subscription_id: 's', amount_cents: 2990, paid_at }));
  const result = churnPaymentHistory('asaas', subscriptions, charges, []);
  expect(result[0]?.due_date).toBe('2026-07-02');
  expect(result[1]?.due_date).toBeUndefined();
});