// Critérios financeiros puros, compartilhados pelo panorama e pelas métricas.
export const brtDay = (value: string | number): string => {
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - 3 * 3600e3).toISOString().slice(0, 10) : '';
};
export const validDay = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

export function monthlyCents(cents: number, interval: string, count = 1): number {
  if (!Number.isFinite(cents) || count <= 0) return 0;
  if (interval === 'month') return Math.round(cents / count);
  if (interval === 'year') return Math.round(cents / (12 * count));
  if (interval === 'week') return Math.round(cents * 365.2425 / (12 * 7 * count));
  if (interval === 'day') return Math.round(cents * 365.2425 / (12 * count));
  return 0;
}

export interface BillingEntry {
  id: string; provider: string; due: string | null; paid: string | null; cents: number;
  receivedCents?: number; source?: string; userId?: string; email?: string; name?: string; plan?: string;
}

export function mergeBilling(entries: Map<string, BillingEntry>, entry: BillingEntry): void {
  const old = entries.get(entry.id);
  if (!old) { entries.set(entry.id, entry); return; }
  // Uma previsão ou retentativa nunca apaga um pagamento comprovado.
  if (old.paid && !entry.paid) return;
  entries.set(entry.id, { ...old, ...entry, due: entry.due || old.due, paid: entry.paid || old.paid });
}

export function billingTotals(rows: BillingEntry[], from: string, to: string, today: string) {
  const due = rows.filter(r => r.due && r.due >= from && r.due <= to);
  const paid = rows.filter(r => r.paid && r.paid >= from && r.paid <= to);
  // Hoje ainda não terminou: vencimento de hoje não é atraso.
  const overdue = due.filter(r => !r.paid && r.due && r.due < today);
  return { expected: due.length, received: paid.length, overdue: overdue.length,
    expectedCents: due.reduce((n, r) => n + r.cents, 0),
    receivedCents: paid.reduce((n, r) => n + (r.receivedCents ?? r.cents), 0),
    overdueCents: overdue.reduce((n, r) => n + r.cents, 0) };
}