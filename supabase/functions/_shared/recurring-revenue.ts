import { brtDay } from './admin-billing.ts';

type Row = Record<string, any>;
export function cycleMonths(cycle: string): number {
  return ({ monthly: 1, mensal: 1, quarterly: 3, trimestral: 3, semiannual: 6, semestral: 6, yearly: 12, annual: 12, anual: 12 } as Record<string, number>)[cycle] || 0;
}
export function addMonths(day: string, months: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0));
  target.setUTCDate(Math.min(date.getUTCDate(), target.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

// Cada contrato tem evidência de pagamento; identidade do perfil não se confunde com identidade da autenticação.
export function reconcileRevenue(profiles: Row[], contracts: Row[], today: string) {
  const byId = new Map<string, Row>(), byEmail = new Map<string, Row[]>();
  for (const p of profiles) {
    for (const id of [p.id, p.user_id].filter(Boolean)) byId.set(id, p);
    const email = String(p.email || '').trim().toLowerCase();
    if (email) byEmail.set(email, [...(byEmail.get(email) || []), p]);
  }
  const rows: Row[] = [], warnings: string[] = [];
  for (const c of contracts) {
    const matches = byEmail.get(String(c.email || '').trim().toLowerCase()) || [];
    const p = byId.get(c.userId) || (matches.length === 1 ? matches[0] : undefined);
    if (p?.status === 'demo' || /^e2e\+.*@olaaura\.com\.br$/i.test(String(c.email || ''))) continue;
    let state = 'unverified';
    if (!p) warnings.push('Contrato sem vínculo único com cliente; separado da receita confirmada.');
    else if (!c.monthlyCents || c.monthlyCents < 0) warnings.push('Contrato sem valor ou ciclo comprovado; separado da receita confirmada.');
    else if (c.paidUntil && c.paidUntil > today) state = c.overdue ? 'risk' : 'recurring';
    else if (c.trialPaid && c.trialUntil > today) state = 'trial';
    else if (c.paidBefore || c.trialPaid || c.overdue) state = 'risk';
    rows.push({ provider: c.provider, contractId: c.id, profileId: p?.id || null, profileStatus: p?.status || null, state, monthlyCents: c.monthlyCents || 0, paidUntil: c.paidUntil || null });
  }
  // Contratos simultâneos do mesmo cliente não são somados silenciosamente.
  const grouped = new Map<string, Row[]>();
  for (const r of rows) if (r.profileId) grouped.set(r.profileId, [...(grouped.get(r.profileId) || []), r]);
  for (const group of grouped.values()) if (group.length > 1) {
    warnings.push('Cliente com mais de um contrato vigente; valores separados até conciliação da duplicidade.');
    for (const r of group) r.state = 'unverified';
  }
  const bucket = (state: string) => {
    const selected = rows.filter(r => r.state === state);
    return { contracts: selected.length, customers: new Set(selected.map(r => r.profileId).filter(Boolean)).size, brl: selected.reduce((n, r) => n + r.monthlyCents, 0) / 100 };
  };
  const providers = Object.fromEntries(['stripe', 'woovi', 'asaas', 'inter'].map(provider => {
    const selected = rows.filter(r => r.provider === provider && r.state === 'recurring');
    return [provider, { contracts: selected.length, brl: selected.reduce((n, r) => n + r.monthlyCents, 0) / 100 }];
  }));
  const active = profiles.filter(p => p.status === 'active');
  const activeBreakdown = Object.fromEntries(['recurring', 'trial', 'risk', 'unverified', 'unlinked'].map(state => [state, active.filter(p => {
    const linked = rows.filter(r => r.profileId === p.id);
    return state === 'unlinked' ? !linked.length : linked.some(r => r.state === state);
  }).length]));
  return { recurring: bucket('recurring'), trial: bucket('trial'), risk: bucket('risk'), unverified: bucket('unverified'), providers, activeProfiles: active.length, activeBreakdown, rows, warnings: [...new Set(warnings)] };
}

export function pixContract(provider: string, s: Row, charges: Row[], today: string): Row {
  const months = cycleMonths(String(s.billing_period));
  const paid = charges.filter(c => c.paid_at && ['COMPLETED', 'CONCLUIDA', 'CONFIRMED', 'RECEIVED', 'PAID'].includes(c.status));
  const recurring = paid.filter(c => !(s.is_trial && (c.kind === 'entry' || c.cycle_index === 0 || Number(c.value_cents ?? c.amount_cents) === Number(s.trial_value_cents))));
  const covered = recurring.map(c => addMonths(String(c.due_date || c.raw_payload?.dueDate || c.raw_payload?.payment?.dueDate || '').slice(0, 10), months)).filter(Boolean).sort();
  const entry = s.entry_paid_at || paid.find(c => !recurring.includes(c))?.paid_at;
  const trialUntil = entry ? new Date(Date.parse(entry) + 7 * 864e5).toISOString().slice(0, 10) : '';
  const paidUntil = covered.at(-1) || '';
  return { id: s.subscription_id || s.id_rec || s.asaas_subscription_id || s.id, provider, userId: s.user_id, email: s.customer_email, monthlyCents: months ? Math.round(Number(s.value_cents) / months) : 0, paidUntil, paidBefore: recurring.length > 0, trialPaid: !!(s.is_trial && entry), trialUntil, overdue: !!(paidUntil && paidUntil <= today) };
}

export function stripeContract(s: Row, invoices: Row[]): Row {
  const paid = invoices.filter(i => (i.subscription || i.parent?.subscription_details?.subscription) === s.id && i.status === 'paid' && i.amount_paid > 0);
  const latest = paid.sort((a, b) => b.created - a.created)[0];
  const monthlyCents = (s.items?.data || []).reduce((n: number, item: Row) => {
    const price = item.price, months = price?.recurring?.interval === 'year' ? 12 * price.recurring.interval_count : price?.recurring?.interval === 'month' ? price.recurring.interval_count : 0;
    if (!months) return n;
    const line = latest?.lines?.data?.find((l: Row) => (l.pricing?.price_details?.price || l.price?.id) === price.id);
    const discount = line?.discount_amounts?.reduce((sum: number, d: Row) => sum + d.amount, 0) || 0;
    return n + Math.round((price.unit_amount * (item.quantity || 1) - discount) / months);
  }, 0);
  const ends = paid.flatMap(i => (i.lines?.data || []).filter((l: Row) => !l.parent?.subscription_item_details?.proration).map((l: Row) => brtDay(l.period?.end || 0))).sort();
  return { id: s.id, provider: 'stripe', userId: s.metadata?.user_id, email: s.metadata?.email || latest?.customer_email, monthlyCents, paidUntil: ends.at(-1), paidBefore: paid.length > 0, trialPaid: s.status === 'trialing' && s.metadata?.trial === 'true', trialUntil: brtDay(s.trial_end || 0), overdue: s.status === 'past_due' };
}