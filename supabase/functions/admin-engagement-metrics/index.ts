import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; inputCached: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15, inputCached: 0.0375, output: 0.60 },
  'gemini-3-flash-preview': { input: 0.15, inputCached: 0.0375, output: 0.60 },
  'gemini-2.5-pro': { input: 1.25, inputCached: 0.3125, output: 10.00 },
  'claude-sonnet-4-6': { input: 3.00, inputCached: 0.30, output: 15.00 },
  'claude-haiku-4-5': { input: 0.80, inputCached: 0.08, output: 4.00 },
};

function getModelPricing(model: string) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key)) return pricing;
  }
  return { input: 0.15, inputCached: 0.0375, output: 0.60 };
}

/**
 * Paginated fetch to bypass Supabase 1000-row limit.
 * Returns all rows matching the query within the period.
 */
async function fetchAllPaginated(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
  filters: { column: string; op: string; value: string | number | boolean | null }[],
  pageSize = 1000
): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    let query = supabase.from(table).select(select);
    for (const f of filters) {
      if (f.op === 'eq') query = query.eq(f.column, f.value);
      else if (f.op === 'gte') query = query.gte(f.column, f.value);
      else if (f.op === 'lte') query = query.lte(f.column, f.value);
      else if (f.op === 'not.is') query = query.not(f.column, 'is', f.value);
    }
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  return allRows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate admin auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Not authenticated');

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) throw new Error('Not admin');

    // Parse date filters
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    try {
      const body = await req.json();
      dateFrom = body.dateFrom || null;
      dateTo = body.dateTo || null;
    } catch { /* no body */ }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const defaultTo = now.toISOString().slice(0, 10);
    const periodStart = (dateFrom || defaultFrom) + 'T00:00:00Z';
    const periodEnd = (dateTo || defaultTo) + 'T23:59:59.999Z';

    // ========== ENGAGEMENT METRICS ==========

    const { count: activeUsersBase } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // FIX: Paginated fetch to avoid 1000-row truncation
    const periodMessages = await fetchAllPaginated(supabase, 'messages', 'user_id', [
      { column: 'role', op: 'eq', value: 'user' },
      { column: 'created_at', op: 'gte', value: periodStart },
      { column: 'created_at', op: 'lte', value: periodEnd },
    ]);

    const uniqueUsersInPeriod = new Set(periodMessages.map(m => m.user_id as string));
    const activeUsersInPeriod = uniqueUsersInPeriod.size;

    const { count: weeklyMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const { data: weeklySessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('status', 'completed')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const weeklySessionsCount = weeklySessions?.length || 0;

    // Avg session duration
    const { data: allCompletedSessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('ended_at', 'is', null)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    let avgSessionMinutes = 0;
    if (allCompletedSessions && allCompletedSessions.length > 0) {
      const totalMinutes = allCompletedSessions.reduce((sum, s) => {
        const start = new Date(s.started_at!).getTime();
        const end = new Date(s.ended_at!).getTime();
        return sum + (end - start) / 60000;
      }, 0);
      avgSessionMinutes = Math.round(totalMinutes / allCompletedSessions.length);
    }

    // Messages per session
    const { data: completedSessionsForMsg } = await supabase
      .from('sessions')
      .select('id, user_id, started_at, ended_at')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('ended_at', 'is', null)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    let messagesPerSession = 0;
    if (completedSessionsForMsg && completedSessionsForMsg.length > 0) {
      const sessionsByUser = new Map<string, typeof completedSessionsForMsg>();
      for (const s of completedSessionsForMsg) {
        if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, []);
        sessionsByUser.get(s.user_id)!.push(s);
      }

      const userAverages: number[] = [];
      for (const [userId, sessions] of sessionsByUser) {
        let userTotalMsgs = 0;
        for (const session of sessions) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('role', 'user')
            .gte('created_at', session.started_at!)
            .lte('created_at', session.ended_at!);
          userTotalMsgs += (count || 0);
        }
        userAverages.push(userTotalMsgs / sessions.length);
      }

      messagesPerSession = userAverages.length > 0
        ? Math.round(userAverages.reduce((a, b) => a + b, 0) / userAverages.length * 10) / 10
        : 0;
    }

    // Return rate
    const returnRate = activeUsersBase && activeUsersBase > 0
      ? Math.round(activeUsersInPeriod / activeUsersBase * 100)
      : 0;

    const periodDays = Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24))) || 1;
    const avgDailyMessagesPerUser = activeUsersInPeriod > 0
      ? Math.round((weeklyMessages || 0) / periodDays / activeUsersInPeriod * 10) / 10
      : 0;

    // ========== COST METRICS ==========

    const tokenLogs = await fetchAllPaginated(supabase, 'token_usage_logs', 'model, prompt_tokens, completion_tokens, cached_tokens', [
      { column: 'created_at', op: 'gte', value: periodStart },
      { column: 'created_at', op: 'lte', value: periodEnd },
    ]);

    let totalCostUSD = 0;
    const costByModel: Record<string, { calls: number; inputCost: number; outputCost: number; cacheSavings: number }> = {};

    for (const log of tokenLogs) {
      const model = log.model as string;
      const promptTokens = (log.prompt_tokens as number) || 0;
      const completionTokens = (log.completion_tokens as number) || 0;
      const cachedTokens = (log.cached_tokens as number) || 0;

      const pricing = getModelPricing(model);
      const nonCachedInput = Math.max(0, promptTokens - cachedTokens);

      const inputCost = (nonCachedInput / 1_000_000) * pricing.input + (cachedTokens / 1_000_000) * pricing.inputCached;
      const outputCost = (completionTokens / 1_000_000) * pricing.output;
      const fullInputCost = (promptTokens / 1_000_000) * pricing.input;
      const savings = fullInputCost - inputCost;

      totalCostUSD += inputCost + outputCost;

      if (!costByModel[model]) {
        costByModel[model] = { calls: 0, inputCost: 0, outputCost: 0, cacheSavings: 0 };
      }
      costByModel[model].calls++;
      costByModel[model].inputCost += inputCost;
      costByModel[model].outputCost += outputCost;
      costByModel[model].cacheSavings += savings;
    }

    totalCostUSD = Math.round(totalCostUSD * 100) / 100;
    const avgCostPerActiveUser = activeUsersInPeriod > 0
      ? Math.round(totalCostUSD / activeUsersInPeriod * 100) / 100
      : 0;

    const costBreakdownByModel = Object.entries(costByModel).map(([model, data]) => ({
      model,
      calls: data.calls,
      cost: Math.round((data.inputCost + data.outputCost) * 100) / 100,
      cacheSavings: Math.round(data.cacheSavings * 100) / 100,
    })).sort((a, b) => b.cost - a.cost);

    const totalCacheSavings = Math.round(costBreakdownByModel.reduce((s, m) => s + m.cacheSavings, 0) * 100) / 100;

    // ========== TRIAL & CONVERSION METRICS ==========
    // Real trials = profiles with trial_started_at (went through actual trial flow)
    // Excludes legacy profiles with plan='essencial' default who never registered a card

    const { count: activeTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null);

    // All trial profiles (with trial_started_at = real trial users)
    const { data: allTrialProfiles } = await supabase
      .from('profiles')
      .select('user_id, plan, status, trial_started_at, created_at, trial_conversations_count')
      .not('trial_started_at', 'is', null);

    // Filter by period using trial_started_at
    const trialsInPeriod = (allTrialProfiles || []).filter(p => {
      const dt = p.trial_started_at!;
      return dt >= periodStart && dt <= periodEnd;
    });

    const totalTrialsInPeriod = trialsInPeriod.length;

    const trialRespondedCount = trialsInPeriod.filter(p => (p.trial_conversations_count || 0) >= 1).length;

    const convertedProfiles = trialsInPeriod.filter(p => p.status === 'active');
    const convertedCount = convertedProfiles.length;

    const conversionRate = totalTrialsInPeriod > 0
      ? Math.round(convertedCount / totalTrialsInPeriod * 1000) / 10
      : 0;

    // Expired trials (trial_started_at > 7 days ago and still trial status)
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const expiredTrialsCount = (allTrialProfiles || []).filter(p => {
      return p.status === 'trial' && p.trial_started_at! < sevenDaysAgoDate;
    }).length;

    // Avg days to conversion (for converted profiles in period)
    let avgDaysToConversion = 0;
    if (convertedProfiles.length > 0) {
      const totalDays = convertedProfiles.reduce((sum, p) => {
        const trialStart = new Date(p.trial_started_at!).getTime();
        const now = Date.now();
        return sum + Math.max(0, (now - trialStart) / (1000 * 60 * 60 * 24));
      }, 0);
      avgDaysToConversion = Math.round(totalDays / convertedProfiles.length * 10) / 10;
    }

    // Avg msgs converted vs non-converted
    const avgMsgsConverted = convertedProfiles.length > 0
      ? Math.round(convertedProfiles.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / convertedProfiles.length * 10) / 10
      : 0;

    const nonConvertedProfiles = trialsInPeriod.filter(p => p.status === 'trial');

    // Trials by plan distribution
    const planCounts: Record<string, number> = {};
    for (const p of trialsInPeriod) {
      const plan = p.plan || 'sem_plano';
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    }
    const trialsByPlan = Object.entries(planCounts).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count);

    const avgMsgsNonConverted = nonConvertedProfiles.length > 0
      ? Math.round(nonConvertedProfiles.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / nonConvertedProfiles.length * 10) / 10
      : 0;

    // ========== ALL-TIME FUNNEL (not filtered by period) ==========
    // Uses trial_started_at to identify real trial users (excludes legacy)
    const allTimeFunnelProfiles = allTrialProfiles || [];
    const funnelTotal = allTimeFunnelProfiles.length;
    const funnelResponded = allTimeFunnelProfiles.filter(p => (p.trial_conversations_count || 0) >= 1).length;
    const funnelConverted = allTimeFunnelProfiles.filter(p => p.status === 'active').length;

    // Cancellation counts
    const { count: canceledUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'canceled');

    const { count: cancelingUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'canceling');

    // ========== CANCELLATION METRICS ==========

    const { data: cancelFeedbackInPeriod } = await supabase
      .from('cancellation_feedback')
      .select('reason, action_taken')
      .eq('action_taken', 'canceled')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const { count: pausedInPeriodCount } = await supabase
      .from('cancellation_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('action_taken', 'paused')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const canceledInPeriod = cancelFeedbackInPeriod?.length || 0;
    const churnRate = activeUsersBase && activeUsersBase > 0
      ? Math.round(canceledInPeriod / activeUsersBase * 1000) / 10
      : 0;

    // Group by reason
    const reasonCounts: Record<string, { reason: string; action_taken: string; count: number }> = {};
    for (const fb of cancelFeedbackInPeriod || []) {
      const key = fb.reason || 'unknown';
      if (!reasonCounts[key]) {
        reasonCounts[key] = { reason: key, action_taken: fb.action_taken || '', count: 0 };
      }
      reasonCounts[key].count++;
    }
    const cancellationReasons = Object.values(reasonCounts).sort((a, b) => b.count - a.count);

    return new Response(JSON.stringify({
      // Engagement
      activeUsers: activeUsersInPeriod,
      activeUsersBase: activeUsersBase || 0,
      weeklyMessages: weeklyMessages || 0,
      weeklySessionsCount,
      avgSessionMinutes,
      messagesPerSession,
      returnRate,
      uniqueRecentUsers: activeUsersInPeriod,
      avgDailyMessagesPerUser,
      // Cost
      totalCostUSD,
      avgCostPerActiveUser,
      costBreakdownByModel,
      totalCacheSavings,
      // Trial & Conversion (period-filtered)
      activeTrials: activeTrials || 0,
      trialsInPeriod: totalTrialsInPeriod,
      totalTrialsAllTime: funnelTotal,
      trialRespondedCount,
      convertedCount,
      conversionRate,
      expiredTrials: expiredTrialsCount,
      trialsByPlan,
      avgDaysToConversion,
      avgMsgsConverted,
      avgMsgsNonConverted,
      canceledUsers: canceledUsers || 0,
      cancelingUsers: cancelingUsers || 0,
      // All-time funnel
      funnelTotal,
      funnelResponded,
      funnelConverted,
      // Cancellation
      canceledInPeriod,
      pausedInPeriod: pausedInPeriodCount || 0,
      churnRate,
      cancellationReasons,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Engagement metrics error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
