import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { listInstallments } from '../_shared/woovi.ts';
import { asaasGetJson } from '../_shared/asaas-reconcile.ts';
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return reply({});
 try {
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key || !anon) throw new Error('Configuração ausente');
  const db = createClient(url, key), internal = req.headers.get('x-internal-secret');
  const { data: secret } = internal ? await db.rpc('get_admin_metrics_snapshot_secret') : { data: null };
  if (!internal || !secret || internal !== secret) {
   const authorization = req.headers.get('Authorization') || '';
   const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
   const { data, error } = await client.auth.getClaims(authorization.replace(/^Bearer /, ''));
   if (error || !data?.claims?.sub) return reply({ error: 'Não autenticado' }, 401);
   const { data: admin } = await db.rpc('has_role', { _user_id: data.claims.sub, _role: 'admin' });
   if (!admin) return reply({ error: 'Acesso restrito' }, 403);
  }
  async function all(table: string, columns: string) {
   const rows: any[] = [];
   for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select(columns).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || [])); if (!data || data.length < 1000) return rows;
   }
  }
  async function store(id: string, provider: string, installments: unknown[]) {
   const { error } = await db.from('admin_billing_provider_snapshots').upsert({ id, provider, installments, fetched_at: new Date().toISOString() });
   if (error) throw error;
  }
  const errors: string[] = [];
  try {
   const stripeKey = Deno.env.get('STRIPE_SECRET_KEY'); if (!stripeKey) throw new Error('Cartão indisponível');
   const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const prices: unknown[] = [], invoices: unknown[] = [], subscriptions: unknown[] = [], weeklyPayments: unknown[] = [], weeklyCharges: unknown[] = [];
   for await (const p of stripe.prices.list({ limit: 100 })) prices.push(p);
   for await (const i of stripe.invoices.list({ limit: 100 })) invoices.push(i);
    for await (const s of stripe.subscriptions.list({ limit: 100, status: 'all', expand: ['data.customer'] })) subscriptions.push(s);
    for await (const c of stripe.charges.list({ limit: 100 })) if (c.status === 'succeeded' && [690,990,1990].includes(c.amount)) weeklyCharges.push(c);
   for await (const p of stripe.paymentIntents.list({ limit: 100 })) {
    if (p.status === 'succeeded' && p.metadata?.trial === 'true') weeklyPayments.push({ id: p.id, customer: p.customer, status: p.status, amount_received: p.amount_received, created: p.created, metadata: { trial: p.metadata.trial } });
   }
    // Cópia completa usada também na conciliação de recorrência e experimentação.
    // Só substitui depois de percorrer todas as páginas com sucesso.
    await store('stripe:billing', 'stripe', [{ prices, invoices, subscriptions, weeklyPayments, weeklyCharges }]);
  } catch { errors.push('Cartão: última cópia preservada'); }
  const [subs, snapshots, payments] = await Promise.all([all('woovi_subscriptions', 'id,subscription_id,billing_period'), all('admin_billing_provider_snapshots', 'id,fetched_at,provider'), all('asaas_payments', 'id,asaas_payment_id,billing_period,raw_payload,paid_at')]);
  const known = new Map(snapshots.map(s => [s.id, s]));
  const pending = subs.filter(s => s.billing_period === 'monthly' && s.subscription_id).sort((a,b) => String(known.get(a.subscription_id)?.fetched_at || '').localeCompare(String(known.get(b.subscription_id)?.fetched_at || '')));
  let refreshed = 0;
  for (const s of pending.slice(0,8)) {
   try { await store(s.subscription_id, 'woovi', await listInstallments(s.subscription_id)); refreshed++; } catch { errors.push('Woovi: última cópia preservada'); }
  }
  for (const p of payments.filter(p => p.billing_period === 'monthly' && p.paid_at && !p.raw_payload?.dueDate && !p.raw_payload?.payment?.dueDate && !known.has(p.asaas_payment_id)).slice(0,8)) {
   try { const payment = await asaasGetJson(`/payments/${encodeURIComponent(p.asaas_payment_id)}`); if (!payment?.dueDate) throw new Error('Vencimento indisponível'); await store(p.asaas_payment_id, 'asaas', [payment]); } catch { errors.push('Asaas: vencimento indisponível'); }
  }
  return reply({ refreshed, errors });
 } catch { return reply({ error: 'Atualização não concluída; dados anteriores preservados.' }, 500); }
});
