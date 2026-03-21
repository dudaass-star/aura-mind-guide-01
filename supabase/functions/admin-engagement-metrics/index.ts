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
  // Try exact match first, then partial match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key)) return pricing;
  }
  // Default fallback (gemini flash pricing)
  return { input: 0.15, inputCached: 0.0375, output: 0.60 };
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
    // Receive YYYY-MM-DD strings and build full UTC day boundaries
    const periodStart = (dateFrom || defaultFrom) + 'T00:00:00Z';
    const periodEnd = (dateTo || defaultTo) + 'T23:59:59.999Z';
    const periodLabel = `${periodStart.slice(0, 10)} – ${periodEnd.slice(0, 10)}`;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ========== ENGAGEMENT METRICS ==========

    const { count: activeUsersBase } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { data: periodMessages } = await supabase
      .from('messages')
      .select('user_id')
      .eq('role', 'user')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const uniqueUsersInPeriod = new Set(periodMessages?.map(m => m.user_id) || []);
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

    // Fetch all token usage logs in period (up to 1000)
    const { data: tokenLogs } = await supabase
      .from('token_usage_logs')
      .select('model, prompt_tokens, completion_tokens, cached_tokens')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    let totalCostUSD = 0;
    const costByModel: Record<string, { calls: number; inputCost: number; outputCost: number; cacheSavings: number }> = {};

    for (const log of tokenLogs || []) {
      const pricing = getModelPricing(log.model);
      const cached = log.cached_tokens || 0;
      const nonCachedInput = Math.max(0, (log.prompt_tokens || 0) - cached);
      
      const inputCost = (nonCachedInput / 1_000_000) * pricing.input + (cached / 1_000_000) * pricing.inputCached;
      const outputCost = ((log.completion_tokens || 0) / 1_000_000) * pricing.output;
      const fullInputCost = ((log.prompt_tokens || 0) / 1_000_000) * pricing.input;
      const savings = fullInputCost - inputCost;

      totalCostUSD += inputCost + outputCost;

      if (!costByModel[log.model]) {
        costByModel[log.model] = { calls: 0, inputCost: 0, outputCost: 0, cacheSavings: 0 };
      }
      costByModel[log.model].calls++;
      costByModel[log.model].inputCost += inputCost;
      costByModel[log.model].outputCost += outputCost;
      costByModel[log.model].cacheSavings += savings;
    }

    totalCostUSD = Math.round(totalCostUSD * 100) / 100;
    const avgCostPerActiveUser = activeUsersInPeriod > 0
      ? Math.round(totalCostUSD / activeUsersInPeriod * 100) / 100
      : 0;

    // Format breakdown
    const costBreakdownByModel = Object.entries(costByModel).map(([model, data]) => ({
      model,
      calls: data.calls,
      cost: Math.round((data.inputCost + data.outputCost) * 100) / 100,
      cacheSavings: Math.round(data.cacheSavings * 100) / 100,
    })).sort((a, b) => b.cost - a.cost);

    const totalCacheSavings = Math.round(costBreakdownByModel.reduce((s, m) => s + m.cacheSavings, 0) * 100) / 100;

    // ========== TRIAL & CONVERSION METRICS ==========
    // Only count trials with a plan (card required) — excludes 72 legacy trials without card
    // Use COALESCE(trial_started_at, created_at) for trials that existed before we started setting trial_started_at

    const { count: activeTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('plan', 'is', null);

    // Trials in period — use created_at as fallback date filter
    const { data: allTrialProfiles } = await supabase
      .from('profiles')
      .select('user_id, plan, status, trial_started_at, created_at, trial_conversations_count')
      .not('plan', 'is', null)
      .or('status.eq.trial,status.eq.active,status.eq.canceled,status.eq.canceling');

    // Filter by period using coalesced date
    const trialsInPeriod = (allTrialProfiles || []).filter(p => {
      const dt = p.trial_started_at || p.created_at;
      return dt && dt >= periodStart && dt <= periodEnd;
    });

    const trialsLast30 = (allTrialProfiles || []).filter(p => {
      const dt = p.trial_started_at || p.created_at;
      return dt && dt >= thirtyDaysAgo;
    });

    const totalTrialsInPeriod = trialsInPeriod.length;
    const trialsLast7DaysCount = totalTrialsInPeriod;
    const trialsLast30DaysCount = trialsLast30.length;

    const trialRespondedCount = trialsInPeriod.filter(p => (p.trial_conversations_count || 0) >= 1).length;

    const convertedProfiles = trialsInPeriod.filter(p => p.status === 'active' && (p.trial_conversations_count || 0) > 0);
    const convertedCount = convertedProfiles.length;

    const conversionRate = totalTrialsInPeriod > 0
      ? Math.round(convertedCount / totalTrialsInPeriod * 1000) / 10
      : 0;

    // Expired trials
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const expiredTrialsCount = trialsInPeriod.filter(p => {
      const dt = p.trial_started_at || p.created_at;
      return p.status === 'trial' && dt && dt < sevenDaysAgoDate;
    }).length;

    // Avg days to conversion
    let avgDaysToConversion = 0;
    if (convertedProfiles.length > 0) {
      const totalDays = convertedProfiles.reduce((sum, p) => {
        const trialStart = new Date(p.trial_started_at || p.created_at!).getTime();
        const conversionDate = new Date(p.created_at!).getTime();
        return sum + Math.max(0, (conversionDate - trialStart) / (1000 * 60 * 60 * 24));
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

    const avgMsgsNonConverted = nonConvertedProfiles && nonConvertedProfiles.length > 0
      ? Math.round(nonConvertedProfiles.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / nonConvertedProfiles.length * 10) / 10
      : 0;

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
      // Trial & Conversion
      activeTrials: activeTrials || 0,
      trialsLast7Days: trialsLast7DaysCount,
      trialsLast30Days: trialsLast30DaysCount,
      totalTrialsEver: totalTrialsInPeriod,
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
      // Cancellation
      canceledInPeriod,
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
