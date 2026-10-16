import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Indicadores da degustação lidos com service role (RLS de messages/checkout bloqueia leitura no cliente).
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const PRICE: Record<string, number> = { essencial: 29.9, direcao: 49.9, transformacao: 79.9 };
const planKey = (p?: string | null) => (p || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const digits = (v?: string | null) => (v || '').replace(/\D/g, '');
// Normaliza telefone para comparação: remove 55 inicial quando há DDD+número.
const normPhone = (v?: string | null) => { const d = digits(v); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d; };
const chunk = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization = req.headers.get('Authorization') || '';
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: claims, error: authError } = await client.auth.getClaims(authorization.replace(/^Bearer /, ''));
    if (authError || !claims?.claims?.sub) return reply({ error: 'Não autenticado' }, 401);
    const db = createClient(url, key);
    const { data: admin } = await db.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
    if (!admin) return reply({ error: 'Acesso restrito' }, 403);

    const { from, to } = await req.json();
    const start = new Date(`${from}T03:00:00Z`).toISOString();
    const end = new Date(new Date(`${to}T03:00:00Z`).getTime() + 864e5).toISOString();

    const { data: profiles, error } = await db.from('profiles')
      .select('id,user_id,name,phone,email,status,plan,degustacao_started_at,degustacao_converted_at,degustacao_prayer_id,degustacao_meditation_id')
      .not('degustacao_started_at', 'is', null).gte('degustacao_started_at', start).lt('degustacao_started_at', end)
      .neq('status', 'demo').order('degustacao_started_at', { ascending: false }).limit(2000);
    if (error) throw error;
    const ps = profiles || [];
    const uids = ps.map((p) => p.user_id).filter(Boolean) as string[];

    const sessions: any[] = []; const charges: any[] = []; const msgCount = new Map<string, number>();
    await Promise.all([
      ...chunk(uids).map(async (ids) => { const { data } = await db.from('sessions').select('user_id,status,closure_mode,started_at,ended_at,quota_exempt,scheduled_at,created_at').in('user_id', ids); sessions.push(...(data || [])); }),
      ...chunk(uids).map(async (ids) => { const { data } = await db.from('woovi_charges').select('user_id,status,paid_at').in('user_id', ids); charges.push(...(data || [])); }),
      ...uids.map(async (id) => {
        const { count } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('role', 'user').gte('created_at', start);
        msgCount.set(id, count || 0);
      }),
    ]);

    // Checkouts do período (inclui compras diretas sem degustação).
    const checkouts: any[] = [];
    for (let off = 0; ; off += 1000) {
      const { data } = await db.from('checkout_sessions').select('phone,email,plan,status,completed_at,created_at').gte('created_at', start).lt('created_at', end).range(off, off + 999);
      checkouts.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const ckPhones = new Set(checkouts.map((c) => normPhone(c.phone)).filter(Boolean));
    const ckEmails = new Set(checkouts.map((c) => (c.email || '').toLowerCase()).filter(Boolean));
    const leadPhones = new Set(ps.map((p) => normPhone(p.phone)).filter(Boolean));
    const leadEmails = new Set(ps.map((p) => (p.email || '').toLowerCase()).filter(Boolean));

    const leads = ps.map((p) => {
      const ss = sessions.filter((s) => s.user_id === p.user_id && (s.quota_exempt || !p.degustacao_converted_at));
      const started = ss.filter((s) => s.started_at);
      const done = ss.find((s) => s.status === 'completed' && s.closure_mode !== 'unilateral');
      const live = ss.find((s) => s.status === 'in_progress');
      const outcome = done ? 'concluido' : live ? 'em_andamento' : started.length ? 'interrompido' : 'sem_inicio';
      const minutes = Math.max(0, ...started.map((s) => (s.ended_at ? (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 6e4 : (Date.now() - Date.parse(s.started_at)) / 6e4)));
      const converted = !!p.degustacao_converted_at || p.status === 'active';
      // Próxima sessão: marcada depois do primeiro encontro iniciado (não conta o agendamento da própria cortesia).
      const firstStart = started.length ? Math.min(...started.map((s) => Date.parse(s.started_at))) : null;
      const next = firstStart === null ? null : sessions
        .filter((s) => s.user_id === p.user_id && s.status !== 'cancelled' && Date.parse(s.created_at) > firstStart && !started.includes(s))
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      const paidPix = charges.some((c) => c.user_id === p.user_id && (c.paid_at || c.status === 'COMPLETED'));
      const ph = normPhone(p.phone); const em = (p.email || '').toLowerCase();
      return {
        id: p.id, name: p.name || 'Sem nome', phone: p.phone, email: p.email, createdAt: p.degustacao_started_at,
        status: p.status, plan: converted ? p.plan : null, convertedAt: converted ? p.degustacao_converted_at : null,
        nextAt: next?.scheduled_at || null,
        sessions: started.length, restarted: started.length > 1, outcome, minutes: Math.round(Math.min(minutes, 120)),
        userMsgs: msgCount.get(p.user_id) || 0, prayer: !!p.degustacao_prayer_id, meditation: !!p.degustacao_meditation_id,
        checkout: converted || (!!ph && ckPhones.has(ph)) || (!!em && ckEmails.has(em)),
        method: converted ? (paidPix ? 'PIX' : 'Cartão') : null,
        value: converted ? PRICE[planKey(p.plan)] || 0 : 0,
      };
    });

    // Compras diretas concluídas no período por quem não é lead de degustação.
    const direct = checkouts.filter((c) => c.completed_at && !leadPhones.has(normPhone(c.phone)) && !leadEmails.has((c.email || '').toLowerCase()));
    const directSales = direct.map((c) => ({ day: c.completed_at, plan: c.plan, value: PRICE[planKey(c.plan)] || 0 }));
    return reply({ leads, directSales });
  } catch (e) {
    console.error('admin-degustacao-metrics', e);
    return reply({ error: String((e as Error).message || e) }, 500);
  }
});
