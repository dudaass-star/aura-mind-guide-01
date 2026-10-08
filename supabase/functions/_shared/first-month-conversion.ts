import { brtDay, validDay } from './admin-billing.ts';

export interface FirstMonthCohort { id: string; identity: string; provider: string; due: string; paid: string | null }
const objectId = (value: any): string => typeof value === 'string' ? value : value?.id || '';
export const invoiceSubscription = (invoice: any): string => objectId(invoice.parent?.subscription_details?.subscription || invoice.subscription);
const recurringMonthly = (price: any) => price?.recurring?.interval === 'month' && price.recurring.interval_count === 1;

export function stripeFirstMonths(subscriptions: any[], intents: any[], invoices: any[], demoEmails: Set<string>) {
  const cohorts: FirstMonthCohort[] = [];
  const warnings: string[] = [];
  for (const sub of subscriptions) {
    const email = String(sub.metadata?.email || '').trim().toLowerCase();
    if (sub.metadata?.trial !== 'true' || !sub.trial_start || !sub.trial_end || demoEmails.has(email)
      || !sub.items?.data?.some((item: any) => recurringMonthly(item.price))) continue;
    // A assinatura com trial não basta: exige a cobrança semanal confirmada no mesmo cliente.
    const paidWeekly = intents.filter(pi => objectId(pi.customer) === objectId(sub.customer)
      && pi.status === 'succeeded' && pi.amount_received > 0 && pi.metadata?.trial === 'true'
      && pi.created <= sub.trial_start && sub.trial_start - pi.created <= 86400);
    if (paidWeekly.length !== 1) { warnings.push('Cartão: semana paga sem vínculo único com a assinatura mensal.'); continue; }
    const due = brtDay(sub.trial_end);
    const firstInvoices = invoices.filter(i => invoiceSubscription(i) === sub.id
      && i.billing_reason === 'subscription_cycle' && i.amount_due > 0
      && i.lines?.data?.some((line: any) => brtDay(line.period?.start) === due));
    const paid = firstInvoices.find(i => i.status === 'paid' && i.amount_paid >= i.amount_due && i.status_transitions?.paid_at);
    cohorts.push({ id: sub.id, identity: email || `stripe:${objectId(sub.customer)}`, provider: 'stripe', due, paid: paid ? brtDay(paid.status_transitions.paid_at) : null });
  }
  return { cohorts, warnings: [...new Set(warnings)] };
}

export function pixFirstDue(start: string, installments: any[], trialCents: number, generationDay: unknown): string | null {
  // Inclui parcelas canceladas: desistir da semana não pode remover o cliente da base.
  const dueDates = installments.filter(i => Number(i.value ?? i.cobr?.value) > 0 && Number(i.value ?? i.cobr?.value) !== trialCents)
    .map(i => String(i.dueDate || i.dateGenerateCharge || i.cobr?.dueDate || '').slice(0, 10))
    .filter(d => validDay(d) && d >= start).sort();
  if (!validDay(start)) return null;
  const first = new Date(`${start}T12:00:00Z`); first.setUTCDate(first.getUTCDate() + 7);
  const due = first.toISOString().slice(0, 10);
  // Só usa D+7 quando o dia oficial do mandato confirma esse calendário.
  if (Number(generationDay) === Number(due.slice(8))) return due;
  // Não toma uma parcela de meses seguintes por primeira mensalidade.
  const earliest = dueDates[0];
  return earliest && Date.parse(earliest) - Date.parse(start) <= 10 * 864e5 ? earliest : null;
}

export function conversionCohort(rows: FirstMonthCohort[], from: string, to: string, today: string) {
  const unique = new Map<string, FirstMonthCohort>();
  for (const row of [...rows].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))) {
    const old = unique.get(row.identity);
    if (!old) unique.set(row.identity, row);
    else if (old.due === row.due && !old.paid && row.paid) unique.set(row.identity, { ...old, paid: row.paid });
  }
  // Datas futuras ficam fora: semanas em andamento não são conversões perdidas.
  const eligible = [...unique.values()].filter(r => r.due >= from && r.due <= to && r.due <= today);
  const converted = eligible.filter(r => r.paid && r.paid <= today);
  return { cohorts: eligible, expected: eligible.length, converted: converted.length, rate: eligible.length ? converted.length / eligible.length * 100 : null };
}