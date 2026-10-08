import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { brtDay } from '../_shared/admin-billing.ts';
import { churnSources, monthlyChurn } from '../_shared/monthly-churn.ts';

const cache = new Map<string, { at: number; data: unknown }>();
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key || !anon) throw new Error('Configuração indisponível');
    const authorization = req.headers.get('Authorization') || '';
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: claims, error } = await client.auth.getClaims(authorization.replace(/^Bearer /, ''));
    if (error || !claims?.claims?.sub) return reply({ error: 'Não autenticado' }, 401);
    const db = createClient(url, key);
    const { data: admin, error: roleError } = await db.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
    if (roleError || !admin) return reply({ error: 'Acesso restrito' }, 403);
    const today = brtDay(new Date().toISOString());
    const hit = cache.get(today);
    if (hit && Date.now() - hit.at < 300e3) return reply(hit.data);
    async function all(table: string, columns: string) {
      const rows: Record<string, any>[] = [];
      let lastId: string | null = null;
      for (;;) {
        let query = db.from(table).select(columns).order('id').limit(1000);
        if (lastId) query = query.gt('id', lastId);
        const { data, error } = await query;
        if (error) throw new Error(`Falha no histórico ${table}`);
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
        const nextId = data.at(-1)?.id;
        if (!nextId || nextId === lastId) throw new Error('Paginação sem avanço');
        lastId = nextId;
      }
    }
    const [profiles, woovi, wooviCharges, asaas, asaasCharges, inter, interCharges, events, mandateEvents, snap] = await Promise.all([
      all('profiles', 'id,user_id,email,status'),
      all('woovi_subscriptions', 'id,subscription_id,recurrency_id,user_id,customer_email,billing_period,is_trial,trial_value_cents,entry_paid_at,status,raw_payload'),
      all('woovi_charges', 'id,subscription_id,kind,cycle_index,value_cents,due_date,paid_at,status,raw_payload'),
      all('asaas_pix_authorizations', 'id,asaas_subscription_id,user_id,customer_email,billing_period,is_trial,trial_value_cents,status,cancelled_at,raw_payload'),
      all('asaas_payments', 'id,asaas_subscription_id,amount_cents,is_trial,status,paid_at,raw_payload'),
      all('inter_pix_recurrences', 'id,id_rec,user_id,customer_email,billing_period,is_trial,trial_value_cents,status,raw_payload'),
      all('inter_pix_charges', 'id,id_rec,cycle_index,value_cents,due_date,paid_at,status'),
      all('retention_events', 'id,user_id,tier,action,metadata,created_at'),
      all('woovi_webhook_events', 'id,payload,created_at'),
      db.from('admin_billing_provider_snapshots').select('installments,fetched_at').eq('id', 'stripe:billing').eq('provider', 'stripe').maybeSingle(),
    ]);
    if (snap.error) throw snap.error;
    const segments = Array.isArray(snap.data?.installments) ? snap.data.installments : [];
    const stripe = segments.length ? {
      subscriptions: [...new Map(segments.flatMap((s: Record<string, any>) => s.subscriptions || []).map((s: Record<string, any>) => [s.id, s])).values()],
      invoices: [...new Map(segments.flatMap((s: Record<string, any>) => s.invoices || []).map((i: Record<string, any>) => [i.id, i])).values()],
      weeklyPayments: [...new Map(segments.flatMap((s: Record<string, any>) => s.weeklyPayments || []).map((p: Record<string, any>) => [p.id, p])).values()],
    } : null;
    const source = churnSources(profiles, stripe, [
      { provider: 'woovi', subscriptions: woovi, charges: wooviCharges },
      { provider: 'asaas', subscriptions: asaas, charges: asaasCharges },
      { provider: 'inter', subscriptions: inter, charges: interCharges },
    ], events, mandateEvents);
    const result = { version: 3, months: monthlyChurn(source.intervals, today), warnings: source.warnings, excluded: source.excluded,
      completeness: source.warnings.length ? 'partial' : 'recorded_sources', updatedAt: new Date().toISOString(), providerUpdatedAt: snap.data?.fetched_at || null };
    cache.clear(); cache.set(today, { at: Date.now(), data: result });
    return reply(result);
  } catch (error) {
    console.error('Falha no churn mensal', error instanceof Error ? error.message : 'Erro desconhecido');
    return reply({ error: 'Não foi possível carregar o churn mensal.' }, 500);
  }
});