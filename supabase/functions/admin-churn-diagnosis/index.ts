// Diagnóstico de Churn Precoce (D8-D30)
// Read-only, admin-only. Para cada usuário que cancelou em D8-D30
// na janela definida, conta quais features de retenção foram
// efetivamente experimentadas antes do cancelamento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; payload: string }>();

function getCached(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { cache.delete(key); return null; }
  return hit.payload;
}
function setCached(key: string, payload: string) {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  if (cache.size > 30) {
    const k = cache.keys().next().value;
    if (k) cache.delete(k);
  }
}

async function fetchAllPaginated(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
  filters: { column: string; op: string; value: string | number | boolean | null }[],
  pageSize = 1000,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    let q = supabase.from(table).select(select);
    for (const f of filters) {
      if (f.op === 'eq') q = q.eq(f.column, f.value);
      else if (f.op === 'gte') q = q.gte(f.column, f.value);
      else if (f.op === 'lt') q = q.lt(f.column, f.value);
      else if (f.op === 'lte') q = q.lte(f.column, f.value);
      else if (f.op === 'not.is') q = q.not(f.column, 'is', f.value);
    }
    q = q.range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== Auth: admin only =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new Error('No authorization header');
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error('Not authenticated');
    const userId = claimsData.claims.sub as string;
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) throw new Error('Not admin');

    // ===== Input =====
    let windowDays = 60;
    let forceRefresh = false;
    try {
      const body = await req.json();
      if (typeof body.windowDays === 'number') windowDays = body.windowDays;
      forceRefresh = !!body.forceRefresh;
    } catch { /* no body */ }
    if (windowDays < 7) windowDays = 7;
    if (windowDays > 180) windowDays = 180;

    const cacheKey = `churn-diag:${windowDays}`;
    if (!forceRefresh) {
      const c = getCached(cacheKey);
      if (c) {
        return new Response(c, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }
    } else {
      cache.delete(cacheKey);
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // ===== 1) Cancelamentos na janela =====
    // Nota: cancellation_feedback frequentemente vem com user_id NULL e
    // apenas o telefone preenchido (sem prefixo "55"). Resolvemos o user_id
    // por telefone via profiles.phone (que armazena com prefixo "55").
    const cancelEvents = await fetchAllPaginated(supabase, 'cancellation_feedback', 'user_id, phone, created_at, reason, action_taken', [
      { column: 'action_taken', op: 'eq', value: 'canceled' },
      { column: 'created_at', op: 'gte', value: windowStart },
    ]);

    // Coleta telefones que precisam ser resolvidos
    const phonesToResolve = new Set<string>();
    for (const c of cancelEvents) {
      if (!c.user_id && c.phone) {
        const raw = String(c.phone).replace(/\D/g, '');
        if (raw) phonesToResolve.add(raw);
      }
    }

    // Resolve telefones -> user_id via profiles. profiles.phone tipicamente
    // tem formato 55 + DDD + número; o cf.phone vem sem o "55". Tentamos
    // ambos: prefixado e sufixo-match.
    const phoneToUserId = new Map<string, string>();
    if (phonesToResolve.size > 0) {
      const phoneList = Array.from(phonesToResolve);
      const candidates = new Set<string>();
      for (const p of phoneList) {
        candidates.add(p);
        candidates.add('55' + p);
      }
      const candArr = Array.from(candidates);
      for (let i = 0; i < candArr.length; i += 200) {
        const chunk = candArr.slice(i, i + 200);
        const { data } = await supabase
          .from('profiles')
          .select('user_id, phone')
          .in('phone', chunk);
        if (data) {
          for (const r of data as { user_id: string; phone: string }[]) {
            const norm = String(r.phone).replace(/\D/g, '');
            phoneToUserId.set(norm, r.user_id);
            if (norm.startsWith('55')) phoneToUserId.set(norm.slice(2), r.user_id);
          }
        }
      }
    }

    // Pega o cancelamento mais recente por user
    const cancelByUser = new Map<string, { canceled_at: string; reason: string }>();
    for (const c of cancelEvents) {
      let uid = c.user_id as string | null;
      if (!uid && c.phone) {
        const raw = String(c.phone).replace(/\D/g, '');
        uid = phoneToUserId.get(raw) || phoneToUserId.get('55' + raw) || null;
      }
      if (!uid) continue;
      const ts = c.created_at as string;
      const existing = cancelByUser.get(uid);
      if (!existing || ts > existing.canceled_at) {
        cancelByUser.set(uid, { canceled_at: ts, reason: (c.reason as string) || 'unknown' });
      }
    }

    if (cancelByUser.size === 0) {
      const empty = JSON.stringify({
        windowDays,
        totalCanceled8_30d: 0,
        totalCanceledInWindow: 0,
        byFeatureExposure: {},
        engagementVolume: { avgMessagesUntilChurn: 0, medianMessagesUntilChurn: 0, avgActiveDaysUntilChurn: 0, silentChurners: 0 },
        bySegment: { naoExperimentou: { count: 0, pct: 0 }, experimentouParcial: { count: 0, pct: 0 }, experimentouMuito: { count: 0, pct: 0 } },
        cancelDayHistogram: {},
        topReasons: [],
        verdict: 'insufficient_data',
      });
      setCached(cacheKey, empty);
      return new Response(empty, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== 2) Busca profiles desses usuários =====
    const userIds = Array.from(cancelByUser.keys());
    const profilesData: Record<string, unknown>[] = [];
    const CHUNK = 100;
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const chunk = userIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, created_at, current_journey_id, current_episode, last_proactive_insight_at, trial_insight_sent_at, awaiting_time_capsule, pending_capsule_audio_url, last_checkin_sent_at')
        .in('user_id', chunk);
      if (error) throw error;
      if (data) profilesData.push(...data);
    }
    const profileByUser = new Map<string, Record<string, unknown>>();
    for (const p of profilesData) profileByUser.set(p.user_id as string, p);

    // ===== 3) Filtra D8-D30 =====
    interface CancelRecord {
      user_id: string;
      created_at: string;
      canceled_at: string;
      lifetime_days: number;
      reason: string;
    }
    const d8_30: CancelRecord[] = [];
    let totalInWindow = 0;
    for (const [uid, c] of cancelByUser) {
      const p = profileByUser.get(uid);
      if (!p) continue;
      const created = p.created_at as string;
      if (!created) continue;
      const lifetimeMs = new Date(c.canceled_at).getTime() - new Date(created).getTime();
      const lifetimeDays = lifetimeMs / (1000 * 60 * 60 * 24);
      totalInWindow++;
      if (lifetimeDays >= 8 && lifetimeDays <= 30) {
        d8_30.push({
          user_id: uid,
          created_at: created,
          canceled_at: c.canceled_at,
          lifetime_days: Math.round(lifetimeDays),
          reason: c.reason,
        });
      }
    }

    if (d8_30.length === 0) {
      const empty = JSON.stringify({
        windowDays,
        totalCanceled8_30d: 0,
        totalCanceledInWindow: totalInWindow,
        byFeatureExposure: {},
        engagementVolume: { avgMessagesUntilChurn: 0, medianMessagesUntilChurn: 0, avgActiveDaysUntilChurn: 0, silentChurners: 0 },
        bySegment: { naoExperimentou: { count: 0, pct: 0 }, experimentouParcial: { count: 0, pct: 0 }, experimentouMuito: { count: 0, pct: 0 } },
        cancelDayHistogram: {},
        topReasons: [],
        verdict: 'insufficient_data',
      });
      setCached(cacheKey, empty);
      return new Response(empty, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== 4) Para cada cancelado D8-30, mede exposição às features =====
    const targetIds = d8_30.map(r => r.user_id);

    // 4a) Mensagens user-role por usuário (entre created_at e canceled_at)
    const allUserMessages: { user_id: string; created_at: string }[] = [];
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('messages')
          .select('user_id, created_at')
          .eq('role', 'user')
          .in('user_id', chunk)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allUserMessages.push(...(data as { user_id: string; created_at: string }[]));
        if (data.length < pageSize) break;
        page++;
      }
    }
    const msgsByUser = new Map<string, { created_at: string }[]>();
    for (const m of allUserMessages) {
      if (!msgsByUser.has(m.user_id)) msgsByUser.set(m.user_id, []);
      msgsByUser.get(m.user_id)!.push({ created_at: m.created_at });
    }

    // 4b) Sessions por usuário
    const allSessions: { user_id: string; status: string; ended_at: string | null; session_summary: string | null; created_at: string }[] = [];
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('sessions')
        .select('user_id, status, ended_at, session_summary, created_at')
        .in('user_id', chunk);
      if (data) allSessions.push(...(data as typeof allSessions));
    }
    const sessionsByUser = new Map<string, typeof allSessions>();
    for (const s of allSessions) {
      if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, []);
      sessionsByUser.get(s.user_id)!.push(s);
    }

    // 4c) Commitments por usuário
    const allCommitments: { user_id: string; created_at: string }[] = [];
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('commitments')
        .select('user_id, created_at')
        .in('user_id', chunk);
      if (data) allCommitments.push(...(data as typeof allCommitments));
    }
    const commitsByUser = new Map<string, number>();
    for (const c of allCommitments) {
      commitsByUser.set(c.user_id, (commitsByUser.get(c.user_id) || 0) + 1);
    }

    // 4d) Monthly letters
    const allLetters: { user_id: string; sent_at: string | null }[] = [];
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('monthly_letters')
        .select('user_id, sent_at')
        .in('user_id', chunk);
      if (data) allLetters.push(...(data as typeof allLetters));
    }
    const lettersByUser = new Set<string>();
    for (const l of allLetters) {
      if (l.sent_at) lettersByUser.add(l.user_id);
    }

    // 4e) Themes (engajamento profundo)
    const allThemes: { user_id: string }[] = [];
    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('session_themes')
        .select('user_id')
        .in('user_id', chunk);
      if (data) allThemes.push(...(data as typeof allThemes));
    }
    const themesByUser = new Set<string>();
    for (const t of allThemes) themesByUser.add(t.user_id);

    // ===== 5) Computa exposição e segmenta =====
    const featureCounts = {
      completedSession: 0,
      startedJourney: 0,
      receivedOracleInsight: 0,
      receivedTrialInsight: 0,
      receivedCapsule: 0,
      receivedMonthlyLetter: 0,
      createdCommitment: 0,
      hasThemes: 0,
    };
    const segments = { naoExperimentou: 0, experimentouParcial: 0, experimentouMuito: 0 };
    const histogram: Record<number, number> = {};
    const reasonCounts: Record<string, number> = {};
    const messagesPerUser: number[] = [];
    const activeDaysPerUser: number[] = [];
    let silentChurners = 0;

    for (const rec of d8_30) {
      const profile = profileByUser.get(rec.user_id) || {};
      const sess = (sessionsByUser.get(rec.user_id) || []).filter(s => s.created_at <= rec.canceled_at);
      const msgs = (msgsByUser.get(rec.user_id) || []).filter(m => m.created_at <= rec.canceled_at);

      // Histograma
      histogram[rec.lifetime_days] = (histogram[rec.lifetime_days] || 0) + 1;
      // Reason
      reasonCounts[rec.reason] = (reasonCounts[rec.reason] || 0) + 1;

      // Volume
      messagesPerUser.push(msgs.length);
      const days = new Set(msgs.map(m => m.created_at.slice(0, 10)));
      activeDaysPerUser.push(days.size);
      if (msgs.length === 0) silentChurners++;

      // Features
      const flags = {
        completedSession: sess.some(s => s.status === 'completed' && s.ended_at),
        startedJourney: !!profile.current_journey_id || ((profile.current_episode as number) || 0) > 0,
        receivedOracleInsight: !!profile.last_proactive_insight_at && (profile.last_proactive_insight_at as string) <= rec.canceled_at,
        receivedTrialInsight: !!profile.trial_insight_sent_at && (profile.trial_insight_sent_at as string) <= rec.canceled_at,
        receivedCapsule: !!profile.awaiting_time_capsule || !!profile.pending_capsule_audio_url,
        receivedMonthlyLetter: lettersByUser.has(rec.user_id),
        createdCommitment: (commitsByUser.get(rec.user_id) || 0) > 0,
        hasThemes: themesByUser.has(rec.user_id),
      };

      let touched = 0;
      for (const k of Object.keys(flags) as (keyof typeof flags)[]) {
        if (flags[k]) {
          featureCounts[k]++;
          touched++;
        }
      }

      if (touched <= 1) segments.naoExperimentou++;
      else if (touched <= 3) segments.experimentouParcial++;
      else segments.experimentouMuito++;
    }

    const total = d8_30.length;
    const pct = (n: number) => Math.round((n / total) * 1000) / 10;

    const byFeatureExposure: Record<string, { count: number; pct: number }> = {};
    for (const [k, v] of Object.entries(featureCounts)) {
      byFeatureExposure[k] = { count: v, pct: pct(v) };
    }

    messagesPerUser.sort((a, b) => a - b);
    const median = messagesPerUser.length === 0 ? 0 : messagesPerUser[Math.floor(messagesPerUser.length / 2)];
    const avgMsgs = messagesPerUser.length === 0 ? 0 : Math.round(messagesPerUser.reduce((a, b) => a + b, 0) / messagesPerUser.length);
    const avgDays = activeDaysPerUser.length === 0 ? 0 : Math.round((activeDaysPerUser.reduce((a, b) => a + b, 0) / activeDaysPerUser.length) * 10) / 10;

    const naoPct = pct(segments.naoExperimentou);
    const muitoPct = pct(segments.experimentouMuito);
    let verdict = 'mixed';
    if (naoPct > 60) verdict = 'exposure_problem';
    else if (muitoPct > 40) verdict = 'fit_problem';

    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const result = {
      windowDays,
      totalCanceledInWindow: totalInWindow,
      totalCanceled8_30d: total,
      byFeatureExposure,
      engagementVolume: {
        avgMessagesUntilChurn: avgMsgs,
        medianMessagesUntilChurn: median,
        avgActiveDaysUntilChurn: avgDays,
        silentChurners,
      },
      bySegment: {
        naoExperimentou: { count: segments.naoExperimentou, pct: naoPct },
        experimentouParcial: { count: segments.experimentouParcial, pct: pct(segments.experimentouParcial) },
        experimentouMuito: { count: segments.experimentouMuito, pct: muitoPct },
      },
      cancelDayHistogram: histogram,
      topReasons,
      verdict,
    };

    const payload = JSON.stringify(result);
    setCached(cacheKey, payload);
    return new Response(payload, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('admin-churn-diagnosis error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});