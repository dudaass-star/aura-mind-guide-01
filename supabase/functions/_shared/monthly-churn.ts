import { addMonths, cycleMonths } from './recurring-revenue.ts';
import { brtDay, validDay } from './admin-billing.ts';

type Row = Record<string, any>;
export interface RecurringInterval { identity: string; start: string; end: string | null; cause: 'voluntary' | 'involuntary' | 'unknown' }
export interface ChurnMonth { month: string; base: number | null; lost: number | null; rate: number | null; voluntary: number | null; involuntary: number | null; unknown: number | null; status: 'no_history' | 'no_base' | 'closed' | 'current' }

export function monthlyChurn(intervals: RecurringInterval[], today: string): ChurnMonth[] {
  const grouped = new Map<string, RecurringInterval[]>();
  for (const i of intervals) {
    if (!validDay(i.start) || (i.end && (!validDay(i.end) || i.end < i.start))) continue;
    grouped.set(i.identity, [...(grouped.get(i.identity) || []), { ...i }]);
  }
  // União de contratos: troca de plano ou provedor não cria uma perda de pessoa.
  const merged: RecurringInterval[] = [];
  for (const list of grouped.values()) {
    const union: RecurringInterval[] = [];
    for (const i of list.sort((a, b) => a.start.localeCompare(b.start))) {
      const last = union.at(-1);
      if (last && (!last.end || i.start <= last.end)) {
        if (last.end && (!i.end || i.end > last.end)) { last.end = i.end; last.cause = i.cause; }
      } else union.push({ ...i });
    }
    merged.push(...union);
  }
  const earliest = merged.map(i => i.start).sort()[0];
  const result: ChurnMonth[] = [];
  const now = new Date(`${today}T12:00:00Z`);
  for (let offset = 11; offset >= 0; offset--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 10);
    const next = addMonths(start, 1);
    const current = offset === 0;
    if (!earliest || earliest >= next) {
      result.push({ month: start.slice(0, 7), base: null, lost: null, rate: null, voluntary: null, involuntary: null, unknown: null, status: 'no_history' }); continue;
    }
    const initial = merged.filter(i => i.start < start && (!i.end || i.end >= start));
    const base = new Set(initial.map(i => i.identity)).size;
    const losses = new Map<string, RecurringInterval>();
    for (const i of initial) if (i.end && i.end >= start && i.end < next && i.end <= today) losses.set(i.identity, i);
    const lost = losses.size;
    result.push({ month: start.slice(0, 7), base, lost, rate: base ? Math.round(lost / base * 10000) / 100 : null,
      voluntary: [...losses.values()].filter(i => i.cause === 'voluntary').length,
      involuntary: [...losses.values()].filter(i => i.cause === 'involuntary').length,
      unknown: [...losses.values()].filter(i => i.cause === 'unknown').length,
      status: current ? 'current' : base ? 'closed' : 'no_base' });
  }
  return result;
}

export function churnSources(profiles: Row[], stripe: Row | null, pix: { provider: string; subscriptions: Row[]; charges: Row[] }[], events: Row[]) {
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
    // Cadastros removidos continuam no histórico pela identidade de cobrança exata.
    const found = identities.get(userId) || (match?.size === 1 ? [...match][0] : !match && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `email:${email}` : null);
    if (!found) missingIdentity++;
    return found || null;
  }
  function push(who: string, start: string, end: string | null, cause: RecurringInterval['cause']) {
    if (!validDay(start) || (end && (!validDay(end) || end < start))) { invalidHistory++; return; }
    intervals.push({ identity: who, start, end, cause });
  }
  for (const s of stripe?.subscriptions || []) {
    if (!(s.items?.data || []).some((i: Row) => ['month', 'year'].includes(i.price?.recurring?.interval))) continue;
    const paid = (stripe?.invoices || []).filter((i: Row) => (i.subscription || i.parent?.subscription_details?.subscription) === s.id && i.status === 'paid' && i.amount_paid > 0)
      .flatMap((i: Row) => (i.lines?.data || []).filter((l: Row) => l.amount > 0 && !l.proration && !l.parent?.subscription_item_details?.proration && l.period?.start && l.period?.end && (!s.trial_end || l.period.start >= s.trial_end)).map((l: Row) => ({ start: brtDay(Math.max(l.period.start, i.status_transitions?.paid_at || i.created)), end: brtDay(l.period.end), email: i.customer_email })));
    if (!paid.length) continue;
    const who = identity(s.metadata?.user_id, s.metadata?.email || s.customer?.email || paid[0].email);
    if (!who) continue;
    const start = paid.map((p: Row) => p.start).sort()[0];
    let end: string | null = null;
    if (s.status === 'canceled' || s.status === 'incomplete_expired') {
      end = s.ended_at ? brtDay(s.ended_at) : null;
      if (!end) { missingEnd++; continue; }
      // Fim do contrato não antecipa perda enquanto existe período pago.
      end = [end, ...paid.map((p: Row) => p.end)].sort().at(-1) || end;
    }
    const reason = s.cancellation_details?.reason;
    push(who, start, end, reason === 'payment_failed' ? 'involuntary' : reason === 'cancellation_requested' ? 'voluntary' : 'unknown');
  }
  for (const source of pix) for (const s of source.subscriptions) {
    const months = cycleMonths(s.billing_period);
    if (!months) continue;
    const id = s.subscription_id || s.id_rec || s.asaas_subscription_id;
    const paid = source.charges.filter(c => (c.subscription_id || c.id_rec || c.asaas_subscription_id) === id && c.paid_at && ['COMPLETED', 'CONCLUIDA', 'CONFIRMED', 'RECEIVED', 'PAID'].includes(c.status)
      && !(s.is_trial && (c.kind === 'entry' || c.cycle_index === 0 || c.is_trial || Number(c.value_cents ?? c.amount_cents) === Number(s.trial_value_cents))));
    if (!paid.length) continue;
    const who = identity(s.user_id, s.customer_email);
    if (!who) continue;
    const start = paid.map(c => brtDay(c.paid_at)).filter(Boolean).sort()[0];
    const cancellation = events.filter(e => e.tier === 'cancel' && e.action === 'applied' && (e.metadata?.subscription_id === id || e.metadata?.id_rec === id)).map(e => brtDay(e.created_at)).sort()[0];
    const raw = s.raw_payload?.subscription || s.raw_payload || {};
    let end: string | null = null;
    const terminal = ['CANCELADA', 'CANCELADO', 'CANCELED', 'CANCELLED', 'REJEITADA', 'REJECTED', 'EXPIRADA', 'EXPIRED', 'INACTIVE'].includes(String(s.status).toUpperCase());
    if (terminal || cancellation) {
      const cancelDay = cancellation || brtDay(s.cancelled_at || raw.cancelledAt || raw.canceledAt || raw.endedAt || '');
      const coverage = paid.map(c => {
        const due = String(c.due_date || c.raw_payload?.dueDate || c.raw_payload?.payment?.dueDate || '').slice(0, 10);
        return validDay(due) ? addMonths(due, months) : '';
      }).filter(Boolean);
      if (!cancelDay || coverage.length !== paid.length) { missingEnd++; continue; }
      end = [cancelDay, ...coverage].sort().at(-1) || cancelDay;
    }
    push(who, start, end, cancellation ? 'voluntary' : 'unknown');
  }
  const warnings: string[] = [];
  if (!stripe || !Array.isArray(stripe.subscriptions)) warnings.push('Histórico do cartão ainda não está disponível.');
  if (missingIdentity) warnings.push(`${missingIdentity} contratos recorrentes sem cliente identificado foram excluídos da contagem de pessoas.`);
  if (missingEnd) warnings.push(`${missingEnd} contratos encerrados sem data efetiva ou período pago comprovado ficaram fora da reconstrução.`);
  if (invalidHistory) warnings.push(`${invalidHistory} contratos com datas inconsistentes ficaram fora da reconstrução.`);
  return { intervals, warnings, excluded: { missingIdentity, missingEnd, invalidHistory } };
}