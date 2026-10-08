import { addMonths, cycleMonths } from './recurring-revenue.ts';
import { brtDay, validDay } from './admin-billing.ts';
import { invoiceSubscription } from './first-month-conversion.ts';

type Row = Record<string, any>;
export interface RecurringInterval { identity: string; start: string; end: string | null; cause: 'voluntary' | 'involuntary' | 'unknown'; recurringStart?: string | null; endUncertain?: boolean }
export interface ChurnMonth { month: string; base: number | null; lost: number | null; rate: number | null; voluntary: number | null; involuntary: number | null; unknown: number | null; trialBase: number | null; recurringBase: number | null; trialLost: number | null; recurringLost: number | null; uncertain: number; status: 'no_history' | 'no_base' | 'closed' | 'current' }
const earliestDay = (days: (string | null | undefined)[]) => days.filter((d): d is string => Boolean(d && validDay(d))).sort()[0] || null;
const latestDay = (days: (string | null | undefined)[]) => days.filter((d): d is string => Boolean(d && validDay(d))).sort().at(-1) || null;
const plusWeek = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);

export function monthlyChurn(intervals: RecurringInterval[], today: string): ChurnMonth[] {
  const grouped = new Map<string, RecurringInterval[]>();
  for (const i of intervals) {
    if (!validDay(i.start) || (i.end && (!validDay(i.end) || i.end < i.start))) continue;
    grouped.set(i.identity, [...(grouped.get(i.identity) || []), { ...i, recurringStart: i.recurringStart === undefined ? i.start : i.recurringStart }]);
  }
  // União por pessoa: conversão e troca de contrato não criam perda.
  const merged: RecurringInterval[] = [];
  for (const list of grouped.values()) {
    const union: RecurringInterval[] = [];
    for (const i of list.sort((a, b) => a.start.localeCompare(b.start))) {
      const last = union.at(-1);
      if (last && (!last.end || i.start <= last.end)) {
        last.recurringStart = earliestDay([last.recurringStart, i.recurringStart]);
        if (last.end && (!i.end || i.end > last.end)) { last.end = i.end; last.cause = i.cause; last.endUncertain = i.endUncertain; }
        else if (last.end === i.end) last.endUncertain = Boolean(last.endUncertain && i.endUncertain);
      } else union.push({ ...i });
    }
    merged.push(...union);
  }
  const earliest = earliestDay(merged.map(i => i.start));
  const result: ChurnMonth[] = [];
  const now = new Date(`${today}T12:00:00Z`);
  for (let offset = 11; offset >= 0; offset--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 10);
    const next = addMonths(start, 1);
    const current = offset === 0;
    if (!earliest || earliest >= next) {
      result.push({ month: start.slice(0, 7), base: null, lost: null, rate: null, voluntary: null, involuntary: null, unknown: null, trialBase: null, recurringBase: null, trialLost: null, recurringLost: null, uncertain: 0, status: 'no_history' }); continue;
    }
    const initial = merged.filter(i => i.start < start && (!i.end || i.end >= start));
    const base = new Set(initial.map(i => i.identity)).size;
    // Cobertura comprovada permanece na história; fim desconhecido nunca vira perda inventada.
    const uncertain = new Set(merged.filter(i => i.endUncertain && i.start < start && i.end && i.end < next).map(i => i.identity)).size;
    const losses = new Map<string, RecurringInterval>();
    for (const i of initial) if (!i.endUncertain && i.end && i.end >= start && i.end < next && i.end <= today) losses.set(i.identity, i);
    const lost = losses.size;
    const trialBase = initial.filter(i => !i.recurringStart || i.recurringStart >= start).length;
    const trialLost = [...losses.values()].filter(i => !i.recurringStart || (i.end && i.recurringStart > i.end)).length;
    result.push({ month: start.slice(0, 7), base, lost, rate: base && !uncertain ? Math.round(lost / base * 10000) / 100 : null,
      voluntary: [...losses.values()].filter(i => i.cause === 'voluntary').length,
      involuntary: [...losses.values()].filter(i => i.cause === 'involuntary').length,
      unknown: [...losses.values()].filter(i => i.cause === 'unknown').length,
      trialBase, recurringBase: base - trialBase, trialLost, recurringLost: lost - trialLost, uncertain,
      status: current ? 'current' : base ? 'closed' : 'no_base' });
  }
  return result;
}

export function churnSources(profiles: Row[], stripe: Row | null, pix: { provider: string; subscriptions: Row[]; charges: Row[] }[], events: Row[], mandateEvents: Row[] = []) {
  const identities = new Map<string, string>(), emails = new Map<string, Set<string>>(), demos = new Set<string>();
  for (const p of profiles) {
    const identity = p.id || p.user_id;
    if (!identity) continue;
    for (const id of [p.id, p.user_id].filter(Boolean)) { identities.set(id, identity); if (p.status === 'demo') demos.add(id); }
    const email = String(p.email || '').trim().toLowerCase();
    if (email) emails.set(email, new Set([...(emails.get(email) || []), identity]));
    if (p.status === 'demo' && email) demos.add(email);
  }
  let missingIdentity = 0, missingEnd = 0, invalidHistory = 0;
  const intervals: RecurringInterval[] = [];
  function identity(userId: string, emailValue: string): string | null {
    const email = String(emailValue || '').trim().toLowerCase();
    if (demos.has(userId) || demos.has(email) || /^e2e\+.*@olaaura\.com\.br$/i.test(email)) return null;
    const match = emails.get(email);
    const found = identities.get(userId) || (match?.size === 1 ? [...match][0] : !match && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `email:${email}` : null);
    if (!found) missingIdentity++;
    return found || null;
  }
  function push(who: string, start: string, end: string | null, cause: RecurringInterval['cause'], recurringStart: string | null, endUncertain = false) {
    if (!validDay(start) || (end && (!validDay(end) || end < start))) { invalidHistory++; return; }
    intervals.push({ identity: who, start, end, cause, recurringStart, endUncertain });
  }
  for (const s of stripe?.subscriptions || []) {
    if (!(s.items?.data || []).some((i: Row) => ['month', 'year'].includes(i.price?.recurring?.interval))) continue;
    const paid = (stripe?.invoices || []).filter((i: Row) => invoiceSubscription(i) === s.id && i.status === 'paid' && i.amount_paid > 0)
      .flatMap((i: Row) => (i.lines?.data || []).filter((l: Row) => l.amount > 0 && !l.proration && !l.parent?.subscription_item_details?.proration && l.period?.start && l.period?.end && (!s.trial_end || l.period.start >= s.trial_end)).map((l: Row) => ({ start: brtDay(Math.max(l.period.start, i.status_transitions?.paid_at || i.created)), end: brtDay(l.period.end), email: i.customer_email })));
    const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
    const weekly = s.metadata?.trial === 'true' && s.trial_start && s.trial_end ? (stripe?.weeklyPayments || []).filter((p: Row) => (typeof p.customer === 'string' ? p.customer : p.customer?.id) === customerId && p.status === 'succeeded' && p.amount_received > 0 && p.metadata?.trial === 'true' && p.created <= s.trial_start && s.trial_start - p.created <= 86400) : [];
    const weekStart = weekly.length === 1 ? brtDay(s.trial_start) : null;
    const recurringStart = earliestDay(paid.map((p: Row) => p.start));
    const start = earliestDay([weekStart, recurringStart]);
    if (!start) continue;
    const who = identity(s.metadata?.user_id, s.metadata?.email || s.customer?.email || paid[0]?.email);
    if (!who) continue;
    let end: string | null = null, uncertain = false;
    if (s.status === 'canceled' || s.status === 'incomplete_expired') {
      const cancellation = s.ended_at ? brtDay(s.ended_at) : null;
      const coverage = latestDay([...paid.map((p: Row) => p.end), weekStart ? brtDay(s.trial_end) : null]);
      uncertain = !cancellation;
      if (uncertain) missingEnd++;
      end = latestDay([cancellation, coverage]);
      if (!end) continue;
    }
    const reason = s.cancellation_details?.reason;
    push(who, start, end, reason === 'payment_failed' ? 'involuntary' : reason === 'cancellation_requested' ? 'voluntary' : 'unknown', recurringStart, uncertain);
  }
  for (const source of pix) for (const s of source.subscriptions) {
    const months = cycleMonths(s.billing_period);
    if (!months) continue;
    const id = s.subscription_id || s.id_rec || s.asaas_subscription_id;
    const allPaid = source.charges.filter(c => (c.subscription_id || c.id_rec || c.asaas_subscription_id) === id && c.paid_at && ['COMPLETED', 'CONCLUIDA', 'CONFIRMED', 'RECEIVED', 'PAID'].includes(c.status));
    const isWeek = (c: Row) => Boolean(s.is_trial && (c.kind === 'entry' || c.cycle_index === 0 || c.is_trial || Number(c.value_cents ?? c.amount_cents) === Number(s.trial_value_cents)));
    const paid = allPaid.filter(c => !isWeek(c));
    const weekStart = s.is_trial ? earliestDay([brtDay(s.entry_paid_at || ''), ...allPaid.filter(isWeek).map(c => brtDay(c.paid_at))]) : null;
    const recurringStart = earliestDay(paid.map(c => brtDay(c.paid_at)));
    const start = earliestDay([weekStart, recurringStart]);
    if (!start) continue;
    const who = identity(s.user_id, s.customer_email);
    if (!who) continue;
    const cancellation = earliestDay(events.filter(e => e.tier === 'cancel' && e.action === 'applied' && (e.metadata?.subscription_id === id || e.metadata?.id_rec === id)).map(e => brtDay(e.created_at)));
    const raw = s.raw_payload?.subscription || s.raw_payload || {};
    let end: string | null = null, uncertain = false;
    const terminal = ['CANCELADA', 'CANCELADO', 'CANCELED', 'CANCELLED', 'REJEITADA', 'REJECTED', 'EXPIRADA', 'EXPIRED', 'INACTIVE'].includes(String(s.status).toUpperCase());
    if (terminal || cancellation) {
      // Eventos oficiais são vinculados por identificador exato, nunca por nome ou data de atualização.
      const mandateEnd = source.provider === 'woovi' ? latestDay(mandateEvents.filter(e => {
        const payload = e.payload || {};
        return (payload.globalID === id || (s.recurrency_id && payload.pixRecurring?.recurrencyId === s.recurrency_id))
          && ['PIX_AUTOMATIC_REJECTED', 'PIX_AUTOMATIC_CANCELED', 'PIX_AUTOMATIC_CANCELLED', 'PIX_AUTOMATIC_EXPIRED'].includes(payload.event)
          && ['REJECTED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(payload.pixRecurring?.status);
      }).map(e => brtDay(e.created_at))) : null;
      const cancelDay = cancellation || brtDay(s.cancelled_at || raw.cancelledAt || raw.canceledAt || raw.endedAt || '') || mandateEnd;
      const coverage = paid.map(c => {
        const due = String(c.due_date || c.raw_payload?.dueDate || c.raw_payload?.payment?.dueDate || '').slice(0, 10);
        return validDay(due) ? addMonths(due, months) : '';
      }).filter(Boolean);
      uncertain = !cancelDay || coverage.length !== paid.length;
      if (uncertain) missingEnd++;
      end = latestDay([cancelDay, ...coverage, weekStart ? plusWeek(weekStart) : null]);
      if (!end) continue;
    }
    push(who, start, end, cancellation ? 'voluntary' : 'unknown', recurringStart, uncertain);
  }
  const warnings: string[] = [];
  if (!stripe || !Array.isArray(stripe.subscriptions)) warnings.push('Histórico do cartão ainda não está disponível.');
  if (missingIdentity) warnings.push(`${missingIdentity} contratos pagos sem cliente identificado foram excluídos da contagem de pessoas.`);
  if (missingEnd) warnings.push(`${missingEnd} contratos encerrados têm fim incompleto: a cobertura comprovada foi preservada, mas perdas e bases posteriores permanecem a conferir.`);
  if (invalidHistory) warnings.push(`${invalidHistory} contratos com datas inconsistentes ficaram fora da reconstrução.`);
  return { intervals, warnings, excluded: { missingIdentity, missingEnd, invalidHistory } };
}
