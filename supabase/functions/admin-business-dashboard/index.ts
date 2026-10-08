import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { brtDay, validDay, mergeBilling } from '../_shared/admin-billing.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const cache = new Map<string, { at: number; data: unknown }>();
const day = brtDay;
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply({});
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key || !anon) throw new Error('Configuração indisponível');
    const authorization = req.headers.get('Authorization') || '';
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: claims, error: authError } = await client.auth.getClaims(authorization.replace(/^Bearer /, ''));
    if (authError || !claims?.claims?.sub) return reply({ error: 'Não autenticado' }, 401);
    const db = createClient(url, key);
    const { data: admin, error: roleError } = await db.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
    if (roleError || !admin) return reply({ error: 'Acesso restrito' }, 403);
    const body = await req.json();
    const { dateFrom, dateTo } = body;
    const validDate = validDay;
    if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo || (Date.parse(dateTo) - Date.parse(dateFrom)) / 864e5 > 365) return reply({ error: 'Escolha um período válido de até 366 dias.' }, 400);
    const cacheKey = `${dateFrom}:${dateTo}`;
    const hit = cache.get(cacheKey);
    if (!body.forceRefresh && hit && Date.now() - hit.at < 300e3) return reply(hit.data);
    const start = `${dateFrom}T03:00:00Z`;
    const endDay = new Date(`${dateTo}T12:00:00Z`); endDay.setUTCDate(endDay.getUTCDate() + 1);
    const end = `${endDay.toISOString().slice(0, 10)}T03:00:00Z`;
    async function all(table: string, columns: string, configure?: (q: any) => any) {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        let q = db.from(table).select(columns).order('id');
        if (configure) q = configure(q);
        const { data, error } = await q.range(offset, offset + 999);
        if (error) throw new Error(`Falha ao consultar ${table}`);
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    }
    const [profiles, subs, charges, asaas, inter, messages, sessions, interSubs] = await Promise.all([
      all('profiles', 'user_id,email,name,status,canceled_at'),
      all('woovi_subscriptions', 'subscription_id,user_id,customer_name,customer_email,plan,billing_period,value_cents,next_charge_date,entry_paid_at,replaced_by_subscription_id,status,is_trial,trial_value_cents,start_date,created_at'),
      all('woovi_charges', 'id,subscription_id,installment_id,user_id,kind,cycle_index,due_date,paid_at,value_cents,status,raw_payload'),
      all('asaas_payments', 'id,asaas_payment_id,user_id,customer_name,customer_email,plan,billing_period,amount_cents,status,paid_at,asaas_subscription_id,raw_payload,is_trial'),
      all('inter_pix_charges', 'id,id_rec,user_id,cycle_index,due_date,paid_at,value_cents,status'),
      all('messages', 'id,user_id,created_at,channel', q => q.eq('role', 'user').eq('channel', 'in_app').gte('created_at', start).lt('created_at', end)),
      all('sessions', 'id,user_id,scheduled_at,status', q => q.gte('scheduled_at', start).lt('scheduled_at', end)),
      all('inter_pix_recurrences', 'id,id_rec,user_id,billing_period,is_trial,customer_name,customer_email,plan'),
    ]);
    const demoIds = new Set(profiles.filter(p => p.status === 'demo').map(p => p.user_id));
    const demoEmails = new Set(profiles.filter(p => p.status === 'demo').map(p => p.email?.toLowerCase()).filter(Boolean));
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    const entries = new Map<string, any>();
    const warnings: string[] = [];
    const issues: { provider: string; reason: string; count: number; cents: number }[] = [];
    const official = new Map<string, any[]>();
    // Varre inclusive mandatos antigos: próximo vencimento não descreve histórico.
    const candidates = subs.filter(s => s.billing_period === 'monthly' && !demoIds.has(s.user_id) && !demoEmails.has(s.customer_email?.toLowerCase()) && (s.entry_paid_at || charges.some(c => c.subscription_id === s.subscription_id && c.paid_at)) && day(s.created_at) <= dateTo);
    const snapshots = await all('admin_billing_provider_snapshots', 'id,installments,fetched_at', q => q.eq('provider', 'woovi'));
    const snapshotMap = new Map(snapshots.map(s => [s.id, s]));
    // A abertura apenas lê cópias persistidas; nunca consulta o provedor.
    for (const s of candidates) {
      const snap = snapshotMap.get(s.subscription_id);
      if (snap) official.set(s.subscription_id, snap.installments);
      else issues.push({ provider: 'woovi', reason: 'Histórico aguardando atualização automática', count: 1, cents: 0 });
    }
    const providerTimes = snapshots.map(s => s.fetched_at);
    function add(e: any) {
      if (demoIds.has(e.userId) || demoEmails.has(e.email?.trim().toLowerCase())) return;
      e.due = validDate(e.due) ? e.due : null;
      if (!e.due && !e.paid) return;
      mergeBilling(entries, e);
    }
    function exactInstallment(c: any, i: any): boolean {
      const cobr = i?.cobr || {};
      const ids = [i?.globalID, i?.id, i?.correlationID, cobr?.installmentId, cobr?.endToEndId, cobr?.identifierId, ...(Array.isArray(cobr.tries) ? cobr.tries.map((t: any) => t.endToEndId) : [])].filter(Boolean).map(String);
      return [c.installment_id, c.raw_payload?.pix?.endToEndId, c.raw_payload?.charge?.endToEndId].filter(Boolean).some(id => ids.includes(String(id)));
    }
    const subMap = new Map(subs.map(s => [s.subscription_id, s]));
    for (const c of charges) {
      const s = subMap.get(c.subscription_id);
      if (s?.billing_period !== 'monthly' || (c.kind === 'entry' && s.is_trial)) continue;
      const inst = (official.get(c.subscription_id) || []).find(i => exactInstallment(c, i));
      const due = String(inst?.dueDate || inst?.dateGenerateCharge || inst?.cobr?.dueDate || '').slice(0, 10) || c.due_date || (c.kind === 'entry' ? s.start_date : null) || null;
      add({ id: `woovi:${c.subscription_id}:${due || c.installment_id || c.id}`, userId: c.user_id || s.user_id, email: s.customer_email, name: s.customer_name, plan: s.plan, provider: 'woovi', due, source: 'cobrança registrada', paid: c.status === 'COMPLETED' && c.paid_at ? day(c.paid_at) : null, cents: c.value_cents || s.value_cents });
    }
    // Parcelas oficiais preservam vencimentos históricos mesmo após cancelamento.
    for (const s of candidates) {
      for (const i of official.get(s.subscription_id) || []) {
        const due = String(i.dueDate || i.dateGenerateCharge || i.cobr?.dueDate || '').slice(0, 10);
        const cents = Number(i.value ?? i.cobr?.value ?? s.value_cents);
        if (!validDate(due) || (s.is_trial && cents === s.trial_value_cents)) continue;
        if (['CANCELED', 'CANCELLED', 'DELETED'].includes(String(i.status).toUpperCase())) continue;
        const charge = charges.find(c => c.subscription_id === s.subscription_id && (exactInstallment(c, i) || (c.due_date === due && !String(c.installment_id).startsWith('E'))) && c.paid_at);
        add({ id: `woovi:${s.subscription_id}:${due}`, userId: s.user_id, email: s.customer_email, name: s.customer_name, plan: s.plan, provider: 'woovi', due, paid: ['PAID', 'COMPLETED', 'CONFIRMED', 'CONCLUDED'].includes(String(i.status).toUpperCase()) && i.cobr?.paymentDate ? day(i.cobr.paymentDate) : charge?.status === 'COMPLETED' ? day(charge.paid_at) : null, cents, source: 'parcela oficial Woovi' });
        if (due >= dateFrom && due <= dateTo && ['PAID', 'COMPLETED', 'CONFIRMED', 'CONCLUDED'].includes(String(i.status).toUpperCase()) && !charge && !i.cobr?.paymentDate) issues.push({ provider: 'woovi', reason: 'Parcela oficial paga sem pagamento conciliado', count: 1, cents });
      }
    }
    for (const s of subs.filter(s => s.billing_period === 'monthly' && s.entry_paid_at && !s.replaced_by_subscription_id && ['ATIVA', 'APROVADA'].includes(s.status))) {
      const p = profileMap.get(s.user_id);
      if (p?.canceled_at && s.next_charge_date > day(p.canceled_at)) continue;
      add({ id: `woovi:${s.subscription_id}:${s.next_charge_date}`, userId: s.user_id, email: s.customer_email, name: s.customer_name, plan: s.plan, provider: 'woovi', due: s.next_charge_date, paid: null, cents: s.value_cents });
    }
    const paymentSnapshots = await all('admin_billing_provider_snapshots', 'id,installments,fetched_at', q => q.eq('provider', 'asaas'));
    const paymentMap = new Map(paymentSnapshots.map(s => [s.id, s]));
    for (const p of asaas.filter(p => p.billing_period === 'monthly' && p.asaas_subscription_id && p.status !== 'DELETED' && !p.is_trial)) {
      let due = p.raw_payload?.dueDate || p.raw_payload?.payment?.dueDate || null;
      if (!due) {
        const snap = paymentMap.get(p.asaas_payment_id);
        due = snap?.installments?.[0]?.dueDate || null;
      }
      add({ id: `asaas:${p.asaas_subscription_id}:${due || p.id}`, userId: p.user_id, email: p.customer_email, name: p.customer_name, plan: p.plan, provider: 'asaas', due, paid: ['RECEIVED', 'CONFIRMED'].includes(p.status) && p.paid_at ? day(p.paid_at) : null, cents: p.amount_cents });
    }
    const interMap = new Map(interSubs.map(s => [s.id_rec, s]));
    for (const c of inter) {
      const s = interMap.get(c.id_rec);
      if (!s || !s.billing_period) { issues.push({ provider: 'inter', reason: 'Cobrança Inter sem ciclo comprovado', count: 1, cents: c.value_cents }); continue; }
      if (s.billing_period !== 'monthly' || (s.is_trial && c.cycle_index === 0)) continue;
      add({ id: `inter:${c.id_rec}:${c.due_date || c.id}`, userId: c.user_id, email: s.customer_email, name: s.customer_name, plan: s.plan, provider: 'inter', due: c.due_date, paid: ['CONCLUIDA', 'COMPLETED', 'PAID'].includes(c.status) && c.paid_at ? day(c.paid_at) : null, cents: c.value_cents, source: 'cobrança Inter' });
    }
    const { data: stripeSnapshot, error: stripeError } = await db.from('admin_billing_provider_snapshots')
      .select('installments,fetched_at').eq('id', 'stripe:billing').eq('provider', 'stripe').maybeSingle();
    if (stripeError) throw stripeError;
    if (!stripeSnapshot) issues.push({ provider: 'stripe', reason: 'Cartão aguardando atualização automática', count: 1, cents: 0 });
    else providerTimes.push(stripeSnapshot.fetched_at);
    const stripeData = stripeSnapshot?.installments?.[0];
    const priceMap = new Map<string, any>((stripeData?.prices || []).map((p: any) => [p.id, p]));
    for (const inv of stripeData?.invoices || []) {
      if (!['subscription_cycle', 'subscription_create'].includes(inv.billing_reason || '') || inv.status === 'draft' || inv.status === 'void' || inv.amount_due <= 0) continue;
      const monthlyLine = inv.lines.data.find((l: any) => {
        const id = l.pricing?.price_details?.price || l.price?.id;
        const p = priceMap.get(id);
        return p?.recurring?.interval === 'month' && p.recurring.interval_count === 1;
      });
      if (!monthlyLine) continue;
      // Não confundir a compra de 7 dias (item avulso) com primeira mensalidade.
      if (inv.billing_reason === 'subscription_create' && monthlyLine.amount <= 0) continue;
      const due = inv.due_date ? day(inv.due_date) : day(inv.created);
      const paid = inv.status === 'paid' && inv.status_transitions?.paid_at ? day(inv.status_transitions.paid_at) : null;
      if (!(due >= dateFrom && due <= dateTo) && !(paid && paid >= dateFrom && paid <= dateTo)) continue;
      add({ id: inv.id, email: inv.customer_email, name: inv.customer_name, provider: 'stripe', plan: inv.metadata?.plan || 'mensal', due, paid, cents: inv.amount_due, receivedCents: inv.amount_paid });
    }
    const billing = [...entries.values()].filter(e => (e.due && e.due >= dateFrom && e.due <= dateTo) || (e.paid && e.paid >= dateFrom && e.paid <= dateTo));
    const missingDue = billing.filter(e => !e.due && e.paid);
    if (missingDue.length) issues.push({ provider: 'all', reason: 'Pagamento contado sem vencimento comprovado', count: missingDue.length, cents: missingDue.reduce((n, e) => n + e.cents, 0) });
    if (issues.length) warnings.push('Dados parciais: há lacunas de conciliação ou de vencimento. Recebimentos comprovados sem vencimento continuam na série recebida.');
    warnings.push('Mensalidades: ciclos mensais integrais; entradas de experimentação semanal não são mensalidades. Previstas seguem vencimentos oficiais disponíveis, sem reconstrução por suposição.');
    const messageDays = new Map<string, { users: Set<string>; count: number }>();
    for (const m of messages) {
      if (demoIds.has(m.user_id)) continue;
      const date = day(m.created_at);
      const group = messageDays.get(date) || { users: new Set<string>(), count: 0 };
      group.users.add(m.user_id); group.count++; messageDays.set(date, group);
    }
    const sessionDays = new Map<string, { completed: number; missed: number }>();
    for (const s of sessions) {
      if (demoIds.has(s.user_id)) continue;
      const date = day(s.scheduled_at);
      const group = sessionDays.get(date) || { completed: 0, missed: 0 };
      if (s.status === 'completed') group.completed++;
      if (s.status === 'no_show') group.missed++;
      sessionDays.set(date, group);
    }
    const days: any[] = [];
    for (let d = new Date(`${dateFrom}T12:00:00Z`); d.toISOString().slice(0, 10) <= dateTo; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      const sent = messageDays.get(date);
      const ss = sessionDays.get(date);
      days.push({ date, active: sent?.users.size || 0, messages: sent?.count || 0, completed: ss?.completed || 0, missed: ss?.missed || 0 });
    }
    const groupedIssues = [...issues.reduce((map, issue) => { const key = `${issue.provider}:${issue.reason}`; const old = map.get(key); map.set(key, { ...issue, count: (old?.count || 0) + issue.count, cents: (old?.cents || 0) + issue.cents }); return map; }, new Map<string, typeof issues[number]>()).values()];
    const result = { billing, days, warnings, providerUpdatedAt: providerTimes.length ? providerTimes.sort()[0] : null, issues: groupedIssues, completeness: issues.length ? 'partial' : 'recorded_sources', updatedAt: new Date().toISOString() };
    if (cache.size > 20) cache.clear();
    cache.set(cacheKey, { at: Date.now(), data: result });
    return reply(result);
  } catch (error) {
    console.error('Falha no panorama administrativo', error instanceof Error ? error.message : 'Erro desconhecido');
    return reply({ error: 'Não foi possível carregar o panorama. Tente atualizar novamente.' }, 500);
  }
});
