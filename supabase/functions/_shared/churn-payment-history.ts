import { brtDay, validDay } from './admin-billing.ts';

type Row = Record<string, any>;
const subscriptionId = (r: Row) => r.subscription_id || r.asaas_subscription_id || r.id_rec;
const e2e = (r: Row) => r.endToEndId || r.endToEndID || r.end_to_end_id || r.raw_payload?.pix?.endToEndId || r.raw_payload?.cobr?.endToEndId || r.cobr?.endToEndId || '';

// A parcela oficial e a entrada original prevalecem sobre vínculos inferidos no extrato.
export function churnPaymentHistory(provider: string, subscriptions: Row[], charges: Row[], snapshots: Row[]): Row[] {
  if (provider === 'asaas') return charges.map(c => {
    if (!c.paid_at || validDay(c.raw_payload?.dueDate)) return c;
    const s = subscriptions.find(s => subscriptionId(s) === subscriptionId(c));
    const raw = s?.raw_payload || {};
    const initial = raw.originType === 'IMMEDIATE_PAYMENT_AND_RECURRING_QR_CODE'
      && raw.subscriptionId === subscriptionId(c) && validDay(s?.start_date)
      && Number(c.amount_cents) === Number(s?.value_cents)
      && brtDay(c.paid_at) >= s.start_date && brtDay(c.paid_at) <= s.start_date;
    return initial ? { ...c, due_date: s.start_date, history_source: 'immediate_contract' } : c;
  });
  if (provider !== 'woovi') return charges;
  const authoritative = new Map<string, Row[]>();
  const add = (key: string, charge: Row) => { if (key) authoritative.set(key, [...(authoritative.get(key) || []), charge]); };
  for (const c of charges) {
    const s = subscriptions.find(s => subscriptionId(s) === subscriptionId(c));
    const raw = c.raw_payload || {};
    const correlation = raw.charge?.correlationID || raw.pix?.charge?.correlationID;
    if (s?.entry_charge_correlation_id && correlation === s.entry_charge_correlation_id) add(e2e(c), c);
  }
  for (const snap of snapshots.filter(s => s.provider === 'woovi')) for (const i of snap.installments || []) {
    const paid = i.cobr?.paymentDate || i.paymentDate;
    const key = e2e(i);
    const due = brtDay(i.dateGenerateCharge || '');
    if (!key || !paid || !validDay(due) || !['COMPLETED', 'CONCLUDED', 'CONCLUIDA'].includes(i.status)) continue;
    if (!subscriptions.some(s => subscriptionId(s) === snap.id)) continue;
    add(key, { id: i.globalID, subscription_id: snap.id, status: 'COMPLETED', paid_at: paid,
      due_date: due, kind: 'cycle', cycle_index: i.installmentNumber, value_cents: i.value,
      raw_payload: { pix: { endToEndId: key } }, history_source: 'official_installment' });
  }
  const used = new Set<string>();
  const result: Row[] = [];
  for (const c of charges) {
    const key = e2e(c), matches = authoritative.get(key) || [];
    const owners = new Set(matches.map(subscriptionId));
    if (!key || owners.size !== 1) { result.push(c); continue; }
    if (!used.has(key)) {
      result.push(matches.find(m => m.history_source === 'official_installment') || matches[0]);
      used.add(key);
    }
  }
  for (const [key, matches] of authoritative) if (!used.has(key) && new Set(matches.map(subscriptionId)).size === 1) {
    result.push(matches.find(m => m.history_source === 'official_installment') || matches[0]);
  }
  return result;
}