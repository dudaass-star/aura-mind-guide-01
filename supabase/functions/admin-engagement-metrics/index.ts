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
 * Convert a date string (yyyy-MM-dd) to BRT (UTC-3) boundaries in ISO format.
 * e.g. "2026-03-25" → start: "2026-03-25T03:00:00.000Z", end: "2026-03-26T02:59:59.999Z"
 */
function toBRTInterval(dateFrom: string, dateTo: string): { periodStart: string; periodEnd: string } {
  // BRT = UTC-3, so midnight BRT = 03:00 UTC
  const periodStart = `${dateFrom}T03:00:00.000Z`;
  // End of day in BRT = next day 02:59:59.999 UTC
  const endDate = new Date(`${dateTo}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const nextDay = endDate.toISOString().slice(0, 10);
  const periodEnd = `${nextDay}T02:59:59.999Z`;
  return { periodStart, periodEnd };
}

/**
 * Paginated fetch to bypass Supabase 1000-row limit.
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
      else if (f.op === 'lt') query = query.lt(f.column, f.value);
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

    // BRT-aligned period boundaries
    const { periodStart, periodEnd } = toBRTInterval(dateFrom || defaultFrom, dateTo || defaultTo);

    console.log(`📊 Period: ${periodStart} → ${periodEnd} (BRT-aligned)`);

    // ========== ENGAGEMENT METRICS ==========

    const { count: activeUsersBase } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Paginated fetch — only user messages for active users count
    const periodUserMessages = await fetchAllPaginated(supabase, 'messages', 'user_id', [
      { column: 'role', op: 'eq', value: 'user' },
      { column: 'created_at', op: 'gte', value: periodStart },
      { column: 'created_at', op: 'lt', value: periodEnd },
    ]);

    const uniqueUsersInPeriod = new Set(periodUserMessages.map(m => m.user_id as string));
    const activeUsersInPeriod = uniqueUsersInPeriod.size;

    // Total user messages in period (count only user role for consistency)
    const userMessagesInPeriod = periodUserMessages.length;

    // Total all messages (user + assistant) for display if needed
    const { count: totalMessagesInPeriod } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd);

    // Sessions completed in period — filter by ended_at, not created_at
    const { data: completedSessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at, user_id')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('ended_at', 'is', null)
      .gte('ended_at', periodStart)
      .lt('ended_at', periodEnd);

    const weeklySessionsCount = completedSessions?.length || 0;

    // Avg session duration (from sessions that ended in period)
    let avgSessionMinutes = 0;
    if (completedSessions && completedSessions.length > 0) {
      const totalMinutes = completedSessions.reduce((sum, s) => {
        const start = new Date(s.started_at!).getTime();
        const end = new Date(s.ended_at!).getTime();
        return sum + (end - start) / 60000;
      }, 0);
      avgSessionMinutes = Math.round(totalMinutes / completedSessions.length);
    }

    // Messages per session (sessions that ended in period)
    let messagesPerSession = 0;
    if (completedSessions && completedSessions.length > 0) {
      const sessionsByUser = new Map<string, typeof completedSessions>();
      for (const s of completedSessions) {
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

    const periodMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
    const periodDays = Math.max(1, Math.round(periodMs / (1000 * 60 * 60 * 24)));
    const avgDailyMessagesPerUser = activeUsersInPeriod > 0
      ? Math.round(userMessagesInPeriod / periodDays / activeUsersInPeriod * 10) / 10
      : 0;

    // ========== COST METRICS ==========

    const tokenLogs = await fetchAllPaginated(supabase, 'token_usage_logs', 'model, prompt_tokens, completion_tokens, cached_tokens', [
      { column: 'created_at', op: 'gte', value: periodStart },
      { column: 'created_at', op: 'lt', value: periodEnd },
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
    // Real trials = profiles with trial_started_at AND plan IS NOT NULL (had card registered)
    // This excludes: legacy profiles and trials without card

    // Active subscribers (paying) — status='active' with trial_started_at (excludes legacy)
    const { count: activeSubscribers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('trial_started_at', 'is', null);

    // Payment failed count — trial with payment_failed_at set
    const { count: paymentFailedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null)
      .not('payment_failed_at', 'is', null);

    // All trials with trial_started_at
    const { count: allTrialsCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null);

    // Active trials (< 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeTrialsReal } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', sevenDaysAgo);

    // Expired trials (>= 7 days, no payment failure)
    const { count: expiredTrialsNoFailure } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null)
      .lt('trial_started_at', sevenDaysAgo)
      .is('payment_failed_at', null);

    const activeTrials = activeTrialsReal || 0;

    // ALL trial profiles with card (plan not null + trial_started_at not null)
    const { data: allTrialWithCard } = await supabase
      .from('profiles')
      .select('user_id, plan, status, trial_started_at, created_at, trial_conversations_count, converted_at')
      .not('trial_started_at', 'is', null)
      .not('plan', 'is', null);

    // ALL trial profiles (with or without card) for "total trials" context
    const { data: allTrialProfiles } = await supabase
      .from('profiles')
      .select('user_id, plan, status, trial_started_at, trial_conversations_count, converted_at')
      .not('trial_started_at', 'is', null);

    // Filter by period using trial_started_at (card-only for funnel)
    const trialsWithCardInPeriod = (allTrialWithCard || []).filter(p => {
      const dt = p.trial_started_at!;
      return dt >= periodStart && dt < periodEnd;
    });

    const trialsInPeriod = (allTrialProfiles || []).filter(p => {
      const dt = p.trial_started_at!;
      return dt >= periodStart && dt < periodEnd;
    });

    const totalTrialsInPeriod = trialsInPeriod.length;
    const trialsWithCardInPeriodCount = trialsWithCardInPeriod.length;

    const trialRespondedCount = trialsWithCardInPeriod.filter(p => (p.trial_conversations_count || 0) >= 1).length;

    // Converted = status active OR has converted_at
    const convertedInPeriodByConvertedAt = trialsWithCardInPeriod.filter(p => {
      if (p.converted_at) {
        return (p.converted_at as string) >= periodStart && (p.converted_at as string) < periodEnd;
      }
      return p.status === 'active';
    });
    const convertedCount = convertedInPeriodByConvertedAt.length;

    const conversionRate = trialsWithCardInPeriodCount > 0
      ? Math.round(convertedCount / trialsWithCardInPeriodCount * 1000) / 10
      : 0;

    // Use pre-computed expired trials counts from above
    const expiredTrialsCount = (expiredTrialsNoFailure || 0) + (paymentFailedCount || 0);

    // Avg days to conversion
    let avgDaysToConversion = 0;
    const convertedProfiles = (allTrialWithCard || []).filter(p => p.status === 'active' || p.converted_at);
    if (convertedProfiles.length > 0) {
      const totalDays = convertedProfiles.reduce((sum, p) => {
        const trialStart = new Date(p.trial_started_at!).getTime();
        const convEnd = p.converted_at ? new Date(p.converted_at as string).getTime() : Date.now();
        return sum + Math.max(0, (convEnd - trialStart) / (1000 * 60 * 60 * 24));
      }, 0);
      avgDaysToConversion = Math.round(totalDays / convertedProfiles.length * 10) / 10;
    }

    // Avg msgs converted vs non-converted (card-only in period)
    const convertedForMsgs = trialsWithCardInPeriod.filter(p => p.status === 'active' || p.converted_at);
    const avgMsgsConverted = convertedForMsgs.length > 0
      ? Math.round(convertedForMsgs.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / convertedForMsgs.length * 10) / 10
      : 0;

    const nonConvertedProfiles = trialsWithCardInPeriod.filter(p => p.status === 'trial');
    const avgMsgsNonConverted = nonConvertedProfiles.length > 0
      ? Math.round(nonConvertedProfiles.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / nonConvertedProfiles.length * 10) / 10
      : 0;

    // Trials by plan distribution (card-only in period)
    const planCounts: Record<string, number> = {};
    for (const p of trialsWithCardInPeriod) {
      const plan = p.plan || 'sem_plano';
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    }
    const trialsByPlan = Object.entries(planCounts).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count);

    // ========== ALL-TIME FUNNEL (card-only) ==========
    const allTimeFunnel = allTrialWithCard || [];
    const funnelTotal = allTimeFunnel.length;
    const funnelResponded = allTimeFunnel.filter(p => (p.trial_conversations_count || 0) >= 1).length;
    const funnelConverted = allTimeFunnel.filter(p => p.status === 'active' || p.converted_at).length;

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
      .lt('created_at', periodEnd);

    const { count: pausedInPeriodCount } = await supabase
      .from('cancellation_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('action_taken', 'paused')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd);

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
      userMessagesInPeriod,
      totalMessagesInPeriod: totalMessagesInPeriod || 0,
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
      // Trial & Conversion (period-filtered, card-only)
      activeTrials: activeTrials || 0,
      trialsInPeriod: totalTrialsInPeriod,
      trialsWithCardInPeriod: trialsWithCardInPeriodCount,
      totalTrialsAllTime: (allTrialProfiles || []).length,
      totalTrialsWithCardAllTime: funnelTotal,
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
      // All-time funnel (card-only)
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
