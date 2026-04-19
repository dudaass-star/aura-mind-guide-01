import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; inputCached: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.15, inputCached: 0.0375, output: 0.60 },
  'gemini-2.5-flash-lite': { input: 0.075, inputCached: 0.01875, output: 0.30 },
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

    // BRL conversion (USD → BRL at ~5.10) and daily-cost alert
    const USD_TO_BRL = 5.10;
    const totalCostBRL = Math.round(totalCostUSD * USD_TO_BRL * 100) / 100;
    const avgDailyCostUSD = Math.round((totalCostUSD / periodDays) * 100) / 100;
    const avgDailyCostBRL = Math.round(avgDailyCostUSD * USD_TO_BRL * 100) / 100;
    // Alert threshold: R$30/day
    const dailyCostAlertBRL = 30;
    const costAlertActive = avgDailyCostBRL > dailyCostAlertBRL;

    // Cache hit rate (cached_tokens / total_input_tokens)
    let totalPromptTokens = 0;
    let totalCachedTokens = 0;
    for (const log of tokenLogs) {
      totalPromptTokens += (log.prompt_tokens as number) || 0;
      totalCachedTokens += (log.cached_tokens as number) || 0;
    }
    const cacheHitRate = totalPromptTokens > 0
      ? Math.round((totalCachedTokens / totalPromptTokens) * 1000) / 10
      : 0;

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

    // ========== BILLING METRICS ==========
    // Only count real charges (amount > 0) — exclude $0 trial invoices
    const { count: billingPaidInPeriod } = await supabase
      .from('stripe_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'invoice.paid')
      .gte('processed_at', periodStart)
      .lt('processed_at', periodEnd)
      .gt('amount', 0);

    const { count: billingFailedInPeriod } = await supabase
      .from('stripe_webhook_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'invoice.payment_failed')
      .gte('processed_at', periodStart)
      .lt('processed_at', periodEnd)
      .gt('amount', 0);

    const billingSuccessInPeriod = billingPaidInPeriod || 0;
    const billingTotalInPeriod = (billingPaidInPeriod || 0) + (billingFailedInPeriod || 0);
    const billingSuccessRate = billingTotalInPeriod > 0
      ? Math.round(billingSuccessInPeriod / billingTotalInPeriod * 1000) / 10
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

    // ========== CANCELLATION METRICS (VOLUNTARY + INVOLUNTARY) ==========

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

    // 🟦 VOLUNTARY CHURN: user clicked cancel
    const voluntaryChurnInPeriod = cancelFeedbackInPeriod?.length || 0;

    // 🟥 INVOLUNTARY CHURN: payment failed 7+ days ago AND not recovered
    // Logic: payment_failed_at is older than (periodEnd - 7d) and status changed to canceled/trial_expired in period
    // OR payment_failed_at falls within period AND it's been 7+ days since
    const sevenDaysBeforePeriodEnd = new Date(new Date(periodEnd).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: involuntaryChurnProfiles } = await supabase
      .from('profiles')
      .select('user_id, status, payment_failed_at, updated_at')
      .not('payment_failed_at', 'is', null)
      .lt('payment_failed_at', sevenDaysBeforePeriodEnd)
      .in('status', ['canceled', 'trial_expired', 'inactive']);

    // Filter: status change happened within period
    const involuntaryChurnInPeriod = (involuntaryChurnProfiles || []).filter(p => {
      const updatedAt = p.updated_at as string;
      return updatedAt >= periodStart && updatedAt < periodEnd;
    }).length;

    // 🟧 PAYMENT AT RISK: real past_due subscriptions in Stripe (computed below in MRR section)
    // Will be assigned after MRR loop runs.
    let paymentAtRiskCount = 0;

    // 🟩 RECOVERY RATE: % of payment_failed users that recovered (status active again)
    const { count: totalPaymentFailedAllTime } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('payment_failed_at', 'is', null);

    const { count: recoveredPayments } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('payment_failed_at', 'is', null)
      .eq('status', 'active');

    const recoveryRate = (totalPaymentFailedAllTime || 0) > 0
      ? Math.round((recoveredPayments || 0) / (totalPaymentFailedAllTime || 1) * 1000) / 10
      : 0;

    // TOTAL CHURN do período (histórico): voluntary + involuntary registrados
    // Obs: past_due >7d HOJE (pastDueExpiredCount) é exposto separado como "involuntaryChurnLive"
    // — representa cobranças velhas que já são churn de fato mas o Stripe ainda não cancelou.
    const canceledInPeriod = voluntaryChurnInPeriod + involuntaryChurnInPeriod;

    // ✅ CORRECTED CHURN: total_churn_in_period / active_at_start_of_period
    const { count: activeAtPeriodStart } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', periodStart)
      .in('status', ['active', 'canceling', 'canceled', 'paused', 'trial_expired', 'inactive']);

    const churnRate = activeAtPeriodStart && activeAtPeriodStart > 0
      ? Math.round(canceledInPeriod / activeAtPeriodStart * 1000) / 10
      : 0;

    const voluntaryChurnRate = activeAtPeriodStart && activeAtPeriodStart > 0
      ? Math.round(voluntaryChurnInPeriod / activeAtPeriodStart * 1000) / 10
      : 0;

    const involuntaryChurnRate = activeAtPeriodStart && activeAtPeriodStart > 0
      ? Math.round(involuntaryChurnInPeriod / activeAtPeriodStart * 1000) / 10
      : 0;

    // Legacy churn (for comparison): cancelled / total base
    const churnRateLegacy = activeUsersBase && activeUsersBase > 0
      ? Math.round(voluntaryChurnInPeriod / activeUsersBase * 1000) / 10
      : 0;

    // Group by reason (período do dashboard)
    const reasonCounts: Record<string, { reason: string; action_taken: string; count: number }> = {};
    for (const fb of cancelFeedbackInPeriod || []) {
      const key = fb.reason || 'unknown';
      if (!reasonCounts[key]) {
        reasonCounts[key] = { reason: key, action_taken: fb.action_taken || '', count: 0 };
      }
      reasonCounts[key].count++;
    }
    const cancellationReasons = Object.values(reasonCounts).sort((a, b) => b.count - a.count);

    // 🟦 Motivos detalhados do banco interno (últimos 30 dias) — alinhado com janela do Stripe
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cancelFeedback30d } = await supabase
      .from('cancellation_feedback')
      .select('reason, action_taken')
      .eq('action_taken', 'canceled')
      .gte('created_at', thirtyDaysAgoIso);

    const internalReasonCounts30d: Record<string, number> = {};
    for (const fb of cancelFeedback30d || []) {
      const key = fb.reason || 'unknown';
      internalReasonCounts30d[key] = (internalReasonCounts30d[key] || 0) + 1;
    }

    // ========== WEEKLY PLANS (STRIPE SOURCE OF TRUTH) ==========
    // Fetch charges from Stripe with amounts 690, 990, 1990 (R$6.90, R$9.90, R$19.90)
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    let totalWeeklyPlans = 0;
    let weeklyPlansOver7d = 0;
    let weeklyPlansExpired = 0;
    let weeklyPlansToPaidSuccess = 0;
    let weeklyPlansInPeriod = 0;

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
      const weeklyAmounts = [690, 990, 1990];

      // Use Stripe search to find charges with specific amounts
      const allWeeklyCharges: Stripe.Charge[] = [];
      for (const amount of weeklyAmounts) {
        let hasMore = true;
        let page: string | undefined;
        while (hasMore) {
          const searchParams: Stripe.ChargeSearchParams = {
            query: `amount:${amount} AND status:"succeeded"`,
            limit: 100,
          };
          if (page) searchParams.page = page;
          const result = await stripe.charges.search(searchParams);
          allWeeklyCharges.push(...result.data);
          hasMore = result.has_more;
          page = result.next_page ?? undefined;
        }
      }

      // Deduplicate by customer ID
      const customerMap = new Map<string, { charge: Stripe.Charge; created: number }>();
      for (const charge of allWeeklyCharges) {
        const custId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
        if (!custId) continue;
        const existing = customerMap.get(custId);
        if (!existing || charge.created > existing.created) {
          customerMap.set(custId, { charge, created: charge.created });
        }
      }

      totalWeeklyPlans = customerMap.size;

      // Determine which are >7d and which are in period
      const sevenDaysAgoTs = Math.floor((now.getTime() - 7 * 24 * 60 * 60 * 1000) / 1000);
      const periodStartTs = Math.floor(new Date(periodStart).getTime() / 1000);
      const periodEndTs = Math.floor(new Date(periodEnd).getTime() / 1000);

      const customersOver7d: string[] = [];
      for (const [custId, { created }] of customerMap) {
        if (created < sevenDaysAgoTs) {
          customersOver7d.push(custId);
        }
        if (created >= periodStartTs && created < periodEndTs) {
          weeklyPlansInPeriod++;
        }
      }
      weeklyPlansOver7d = customersOver7d.length;

      // Check invoices directly in Stripe for customers >7d
      // subscription_cycle with total > 0 = monthly billing attempt after trial
      for (const custId of customersOver7d) {
        try {
          const invoices = await stripe.invoices.list({ customer: custId, limit: 20 });
          
          const monthlyInvoices = invoices.data.filter(inv => 
            inv.billing_reason === 'subscription_cycle' && 
            (inv.total || 0) > 0 &&
            inv.status !== 'draft'  // draft = not yet attempted by Stripe
          );
          
          if (monthlyInvoices.length > 0) {
            weeklyPlansExpired++;
            
            const hasPaidMonthly = monthlyInvoices.some(inv => inv.status === 'paid');
            if (hasPaidMonthly) {
              weeklyPlansToPaidSuccess++;
            }
          }
        } catch (e) {
          console.warn(`⚠️ Failed to fetch invoices for ${custId}:`, e);
        }
      }
    }

    const trialToPaidRate = weeklyPlansExpired > 0
      ? Math.round(weeklyPlansToPaidSuccess / weeklyPlansExpired * 1000) / 10
      : 0;

    console.log(`📊 Weekly Plans: total=${totalWeeklyPlans}, >7d=${weeklyPlansOver7d}, expired=${weeklyPlansExpired}, converted=${weeklyPlansToPaidSuccess}, rate=${trialToPaidRate}%`);

    // ========== CHECKOUT FUNNEL METRICS (deduplicated by phone) ==========

    // Fetch sessions in period and deduplicate by phone
    const { data: periodSessions } = await supabase
      .from('checkout_sessions')
      .select('phone, status')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd);

    const uniquePhonesCreated = new Set<string>();
    const uniquePhonesCompleted = new Set<string>();
    for (const s of (periodSessions || [])) {
      if (s.phone) uniquePhonesCreated.add(s.phone);
      if (s.phone && s.status === 'completed') uniquePhonesCompleted.add(s.phone);
    }
    const checkoutCreatedInPeriod = uniquePhonesCreated.size;
    const checkoutCompletedInPeriod = uniquePhonesCompleted.size;

    // All-time checkout funnel (deduplicated)
    const { data: allTimeSessions } = await supabase
      .from('checkout_sessions')
      .select('phone, status');

    const allPhonesCreated = new Set<string>();
    const allPhonesCompleted = new Set<string>();
    for (const s of (allTimeSessions || [])) {
      if (s.phone) allPhonesCreated.add(s.phone);
      if (s.phone && s.status === 'completed') allPhonesCompleted.add(s.phone);
    }
    const checkoutCreatedAllTime = allPhonesCreated.size;
    const checkoutCompletedAllTime = allPhonesCompleted.size;

    const checkoutDropoffInPeriod = (checkoutCreatedInPeriod || 0) - (checkoutCompletedInPeriod || 0);
    const checkoutCompletionRate = (checkoutCreatedInPeriod || 0) > 0
      ? Math.round((checkoutCompletedInPeriod || 0) / (checkoutCreatedInPeriod || 0) * 1000) / 10
      : 0;

    // ========== 💰 MRR & REVENUE METRICS (STRIPE = SOURCE OF TRUTH) ==========
    const PLAN_PRICES_MONTHLY: Record<string, number> = {
      essencial: 2990,
      direcao: 4990,
      transformacao: 7990,
    };
    const WEEKLY_PRICES: Record<string, number> = {
      essencial: 690,
      direcao: 990,
      transformacao: 1990,
    };

    // Map Stripe price IDs to plan names
    const priceToPlan: Record<string, { plan: string; cycle: 'monthly' | 'yearly' | 'weekly' }> = {};
    const priceMappings = [
      { env: 'STRIPE_PRICE_ESSENCIAL_MONTHLY', plan: 'essencial', cycle: 'monthly' as const },
      { env: 'STRIPE_PRICE_ESSENCIAL_YEARLY', plan: 'essencial', cycle: 'yearly' as const },
      { env: 'STRIPE_PRICE_ESSENCIAL_TRIAL', plan: 'essencial', cycle: 'weekly' as const },
      { env: 'STRIPE_PRICE_DIRECAO_MONTHLY', plan: 'direcao', cycle: 'monthly' as const },
      { env: 'STRIPE_PRICE_DIRECAO_YEARLY', plan: 'direcao', cycle: 'yearly' as const },
      { env: 'STRIPE_PRICE_DIRECAO_TRIAL', plan: 'direcao', cycle: 'weekly' as const },
      { env: 'STRIPE_PRICE_TRANSFORMACAO_MONTHLY', plan: 'transformacao', cycle: 'monthly' as const },
      { env: 'STRIPE_PRICE_TRANSFORMACAO_YEARLY', plan: 'transformacao', cycle: 'yearly' as const },
      { env: 'STRIPE_PRICE_TRANSFORMACAO_TRIAL', plan: 'transformacao', cycle: 'weekly' as const },
    ];
    for (const { env, plan, cycle } of priceMappings) {
      const id = Deno.env.get(env);
      if (id) priceToPlan[id] = { plan, cycle };
    }

    const mrrByPlan: Record<string, { committed: number; weekly: number; users: number }> = {};
    let mrrCommittedCents = 0;
    let weeklyRevenueCents = 0;
    // "Em risco" = TODAS as past_due no Stripe (Smart Retries roda por ~30 dias).
    // Separamos em recente (≤7d) e crítico (>7d) só para visualização — ambos ainda são recuperáveis.
    let mrrAtRiskCents = 0;                    // total (recent + critical)
    let mrrAtRiskRecentCents = 0;              // ≤7d
    let mrrAtRiskCriticalCents = 0;            // >7d (ainda past_due no Stripe)
    let mrrAtRiskMonthlyCents = 0;
    let mrrAtRiskWeeklyCents = 0;
    let activeSubscriptionsCount = 0;
    let weeklyActiveSubscriptionsCount = 0;
    let monthlyActiveSubscriptionsCount = 0;
    let pastDueSubscriptionsCount = 0;         // total past_due no Stripe (recuperáveis)
    let pastDueRecentCount = 0;                // past_due ≤7d
    let pastDueCriticalCount = 0;              // past_due >7d (Stripe ainda tentando)

    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
      
      // Fetch all active + trialing + past_due subscriptions (paginated)
      // NOTE: 'trialing' is required because weekly plans (R$6.90/9.90/19.90) stay
      // in 'trialing' status during the first 7 days before converting to 'active' monthly.
      const allSubs: Stripe.Subscription[] = [];
      for (const status of ['active', 'trialing', 'past_due'] as const) {
        let hasMore = true;
        let startingAfter: string | undefined;
        while (hasMore) {
          const params: Stripe.SubscriptionListParams = { status, limit: 100 };
          if (startingAfter) params.starting_after = startingAfter;
          const result = await stripe.subscriptions.list(params);
          allSubs.push(...result.data);
          hasMore = result.has_more;
          if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
        }
      }

      for (const sub of allSubs) {
        const priceId = sub.items.data[0]?.price?.id;
        if (!priceId) continue;
        const mapping = priceToPlan[priceId];
        if (!mapping) continue;

        const { plan, cycle } = mapping;
        if (!mrrByPlan[plan]) mrrByPlan[plan] = { committed: 0, weekly: 0, users: 0 };
        mrrByPlan[plan].users++;

        // Skip paused subscriptions for MRR
        if (sub.pause_collection) continue;

        // Past due → conta como "Em risco" enquanto Stripe ainda está tentando recuperar (até ~30 dias).
        // Smart Retries do Stripe roda por ~4 semanas antes de marcar como canceled/unpaid.
        // Separamos em "recente" (≤7d) e "crítico" (>7d) apenas para visualização — ambos são recuperáveis.
        if (sub.status === 'past_due') {
          const periodEndMs = (sub.current_period_end || 0) * 1000;
          const daysSinceFailure = periodEndMs > 0
            ? (Date.now() - periodEndMs) / (1000 * 60 * 60 * 24)
            : 999;

          pastDueSubscriptionsCount++;
          const realAmount = sub.items.data[0]?.price?.unit_amount || 0;
          let monthlyContribution = 0;
          if (cycle === 'monthly') {
            monthlyContribution = realAmount;
            mrrAtRiskMonthlyCents += realAmount;
          } else if (cycle === 'yearly') {
            monthlyContribution = Math.round(realAmount / 12);
            mrrAtRiskMonthlyCents += monthlyContribution;
          } else if (cycle === 'weekly') {
            monthlyContribution = Math.round(realAmount * 4.33);
            mrrAtRiskWeeklyCents += monthlyContribution;
          }
          mrrAtRiskCents += monthlyContribution;
          if (daysSinceFailure > 7) {
            pastDueCriticalCount++;
            mrrAtRiskCriticalCents += monthlyContribution;
          } else {
            pastDueRecentCount++;
            mrrAtRiskRecentCents += monthlyContribution;
          }
          continue;
        }

        // 'trialing' status in this project = paid 7-day weekly cycle on a MONTHLY price.
        // Stripe holds the subscription in 'trialing' until the first full monthly charge.
        // Economically these users are on the WEEKLY plan (R$6.90/9.90/19.90), not monthly yet.
        // We count them as weekly revenue (× 4.33) to avoid inflating committed MRR.
        if (sub.status === 'trialing') {
          if (cycle === 'monthly' || cycle === 'weekly') {
            activeSubscriptionsCount++;
            weeklyActiveSubscriptionsCount++;
            const weeklyPrice = WEEKLY_PRICES[plan] || 0;
            const monthlyEquivalent = Math.round(weeklyPrice * 4.33);
            weeklyRevenueCents += monthlyEquivalent;
            mrrByPlan[plan].weekly += monthlyEquivalent;
          }
          // yearly trialing = legacy free trial, ignore
          continue;
        }

        if (cycle === 'monthly') {
          activeSubscriptionsCount++;
          monthlyActiveSubscriptionsCount++;
          const price = PLAN_PRICES_MONTHLY[plan] || 0;
          mrrCommittedCents += price;
          mrrByPlan[plan].committed += price;
        } else if (cycle === 'yearly') {
          activeSubscriptionsCount++;
          monthlyActiveSubscriptionsCount++;
          const yearlyAmount = sub.items.data[0]?.price?.unit_amount || 0;
          const monthlyEquiv = Math.round(yearlyAmount / 12);
          mrrCommittedCents += monthlyEquiv;
          mrrByPlan[plan].committed += monthlyEquiv;
        } else if (cycle === 'weekly') {
          // Active weekly (rare — usually means recurring weekly price exists)
          activeSubscriptionsCount++;
          weeklyActiveSubscriptionsCount++;
          const realAmount = sub.items.data[0]?.price?.unit_amount || WEEKLY_PRICES[plan] || 0;
          const monthlyEquivalent = Math.round(realAmount * 4.33);
          weeklyRevenueCents += monthlyEquivalent;
          mrrByPlan[plan].weekly += monthlyEquivalent;
        }
      }

      // Sync paymentAtRiskCount with real past_due count from Stripe
      paymentAtRiskCount = pastDueSubscriptionsCount;
    }

    // ========== 🔴 CHURN REAL DO STRIPE (Voluntário + Involuntário) ==========
    // Stripe é a fonte da verdade — captura cancelamentos via Portal Stripe,
    // via API e via webhook que podem não estar refletidos no banco interno.
    //
    // Voluntário:    cancellation_requested | customer_service | too_expensive |
    //                missing_features | switched_service | unused | low_quality | other
    // Involuntário:  payment_failed (após esgotar Smart Retries por ~30 dias)
    //
    // Janela: últimos 30 dias (alinhado com ciclo de retry do Stripe)
    let involuntaryChurnFromStripeCount = 0;
    let voluntaryChurnFromStripeCount = 0;
    const stripeChurnReasons: Record<string, number> = {};
    const VOLUNTARY_REASONS = new Set([
      'cancellation_requested',
      'customer_service',
      'too_expensive',
      'missing_features',
      'switched_service',
      'unused',
      'low_quality',
      'other',
    ]);

    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
        const thirtyDaysAgoTs = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        let hasMore = true;
        let startingAfter: string | undefined;
        let stop = false;
        while (hasMore && !stop) {
          const params: Stripe.SubscriptionListParams = {
            status: 'canceled',
            limit: 100,
          };
          if (startingAfter) params.starting_after = startingAfter;
          const result = await stripe.subscriptions.list(params);
          for (const sub of result.data) {
            const canceledAt = sub.canceled_at || 0;
            if (canceledAt < thirtyDaysAgoTs) continue;
            const reason = sub.cancellation_details?.reason || 'unknown';
            stripeChurnReasons[reason] = (stripeChurnReasons[reason] || 0) + 1;
            if (reason === 'payment_failed') {
              involuntaryChurnFromStripeCount++;
            } else if (VOLUNTARY_REASONS.has(reason)) {
              voluntaryChurnFromStripeCount++;
            }
          }
          hasMore = result.has_more;
          if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
          // Safety: se a página mais antiga já passou de 30d, parar paginação
          const oldest = result.data[result.data.length - 1];
          if (oldest && (oldest.canceled_at || 0) < thirtyDaysAgoTs) stop = true;
        }
        console.log(`🔴 Stripe Churn (30d): voluntary=${voluntaryChurnFromStripeCount}, involuntary=${involuntaryChurnFromStripeCount}, reasons=${JSON.stringify(stripeChurnReasons)}`);
      } catch (e) {
        console.warn('⚠️ Failed to fetch churn from Stripe:', e);
      }
    }

    const totalChurnFromStripe = voluntaryChurnFromStripeCount + involuntaryChurnFromStripeCount;

    // ============================================================
    // 📊 RETENÇÃO POR COORTE (Cohort Retention)
    // ============================================================
    // Para cada bucket de idade (≤7d, ≤30d, ≤60d, ≤90d), calcula:
    //   - total: assinaturas criadas há ≥ Nd (coorte madura)
    //   - canceled: quantas dessas foram canceladas dentro de Nd da criação
    //   - pct: % de churn no bucket
    // Considera apenas coortes "maduras" para evitar viés (sub criada há 3d
    // não pode ser contada no bucket de 30d porque ainda não teve chance).
    // ------------------------------------------------------------
    type CohortBucket = { total: number; canceled: number; pct: number };
    const cohortRetention: Record<string, CohortBucket> = {
      churn7d: { total: 0, canceled: 0, pct: 0 },
      churn30d: { total: 0, canceled: 0, pct: 0 },
      churn60d: { total: 0, canceled: 0, pct: 0 },
      churn90d: { total: 0, canceled: 0, pct: 0 },
    };

    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
        const DAY = 24 * 60 * 60;
        const nowTs = Math.floor(Date.now() / 1000);
        // Janela: últimos 180 dias para garantir dados de 90d+
        const windowStartTs = nowTs - 180 * DAY;

        const buckets = [
          { key: 'churn7d', days: 7 },
          { key: 'churn30d', days: 30 },
          { key: 'churn60d', days: 60 },
          { key: 'churn90d', days: 90 },
        ];

        // Pagina TODAS as subscriptions criadas nos últimos 180 dias (status: all)
        let hasMore = true;
        let startingAfter: string | undefined;
        let processedCount = 0;
        while (hasMore) {
          const params: Stripe.SubscriptionListParams = {
            status: 'all',
            limit: 100,
            created: { gte: windowStartTs },
          };
          if (startingAfter) params.starting_after = startingAfter;
          const result = await stripe.subscriptions.list(params);

          for (const sub of result.data) {
            const createdTs = sub.created;
            const ageDays = (nowTs - createdTs) / DAY;
            const canceledTs = sub.canceled_at || 0;
            const lifetimeDays = canceledTs > 0 ? (canceledTs - createdTs) / DAY : null;

            for (const { key, days } of buckets) {
              // Coorte madura: sub precisa ter idade ≥ Nd para entrar no denominador
              if (ageDays >= days) {
                cohortRetention[key].total++;
                // Cancelou DENTRO da janela de Nd após criação?
                if (lifetimeDays !== null && lifetimeDays <= days) {
                  cohortRetention[key].canceled++;
                }
              }
            }
            processedCount++;
          }

          hasMore = result.has_more;
          if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
        }

        for (const key of Object.keys(cohortRetention)) {
          const b = cohortRetention[key];
          b.pct = b.total > 0 ? Math.round((b.canceled / b.total) * 1000) / 10 : 0;
        }

        console.log(`📊 Cohort Retention (processed ${processedCount} subs):`, JSON.stringify(cohortRetention));
      } catch (e) {
        console.warn('⚠️ Failed to compute cohort retention:', e);
      }
    }

    const mrrTotalCents = mrrCommittedCents + weeklyRevenueCents;
    const mrrCommittedBRL = Math.round(mrrCommittedCents / 100 * 100) / 100;
    const mrrWeeklyEquivBRL = Math.round(weeklyRevenueCents / 100 * 100) / 100;
    const mrrTotalBRL = Math.round(mrrTotalCents / 100 * 100) / 100;
    const mrrAtRiskBRL = Math.round(mrrAtRiskCents / 100 * 100) / 100;
    const mrrAtRiskRecentBRL = Math.round(mrrAtRiskRecentCents / 100 * 100) / 100;
    const mrrAtRiskCriticalBRL = Math.round(mrrAtRiskCriticalCents / 100 * 100) / 100;
    const mrrAtRiskMonthlyBRL = Math.round(mrrAtRiskMonthlyCents / 100 * 100) / 100;
    const mrrAtRiskWeeklyBRL = Math.round(mrrAtRiskWeeklyCents / 100 * 100) / 100;

    const mrrBreakdown = Object.entries(mrrByPlan).map(([plan, data]) => ({
      plan,
      users: data.users,
      committedBRL: Math.round(data.committed / 100 * 100) / 100,
      weeklyEquivBRL: Math.round(data.weekly / 100 * 100) / 100,
      totalBRL: Math.round((data.committed + data.weekly) / 100 * 100) / 100,
    })).sort((a, b) => b.totalBRL - a.totalBRL);

    // ========== 🎯 ACTIVATION RATE (uses true first message, not last) ==========
    const { data: activePayingProfiles } = await supabase
      .from('profiles')
      .select('user_id, plan, status, trial_started_at, converted_at, created_at')
      .in('status', ['active', 'trial']);

    const payingUsers = (activePayingProfiles || []).filter(p => p.trial_started_at);
    const payingUserIds = payingUsers.map(p => p.user_id as string);

    // Fetch FIRST user message per user (paginated, to bypass 1000-row limit)
    const firstMsgByUser = new Map<string, string>();
    if (payingUserIds.length > 0) {
      const allUserMsgs = await fetchAllPaginated(
        supabase,
        'messages',
        'user_id, created_at',
        [{ column: 'role', op: 'eq', value: 'user' }]
      );
      for (const m of allUserMsgs) {
        const uid = m.user_id as string;
        const ts = m.created_at as string;
        const existing = firstMsgByUser.get(uid);
        if (!existing || ts < existing) {
          firstMsgByUser.set(uid, ts);
        }
      }
    }

    const activatedUsers = payingUsers.filter(p => {
      const firstMsgTs = firstMsgByUser.get(p.user_id as string);
      if (!firstMsgTs || !p.created_at) return false;
      const created = new Date(p.created_at as string).getTime();
      const firstMsg = new Date(firstMsgTs).getTime();
      const diffDays = (firstMsg - created) / (1000 * 60 * 60 * 24);
      return diffDays <= 3 && diffDays >= 0;
    });
    const silentPayers = payingUsers.filter(p => !firstMsgByUser.has(p.user_id as string));
    const activationRate = payingUsers.length > 0
      ? Math.round(activatedUsers.length / payingUsers.length * 1000) / 10
      : 0;

    // ========== 📈 MATURE TRIAL CONVERSION ==========
    // Only count trials with ≥7 days of life (full cycle)
    const matureTrials = (allTrialWithCard || []).filter(p => {
      const ts = p.trial_started_at as string;
      return ts <= sevenDaysAgo;
    });
    const matureConverted = matureTrials.filter(p => p.status === 'active' || p.converted_at);
    const matureConversionRate = matureTrials.length > 0
      ? Math.round(matureConverted.length / matureTrials.length * 1000) / 10
      : 0;

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
      totalCostBRL,
      avgDailyCostUSD,
      avgDailyCostBRL,
      dailyCostAlertBRL,
      costAlertActive,
      cacheHitRate,
      avgCostPerActiveUser,
      costBreakdownByModel,
      totalCacheSavings,
      // Trial & Conversion
      activeTrials,
      activeSubscribers: activeSubscribers || 0,
      paymentFailedCount: paymentFailedCount || 0,
      expiredTrialsAwaitingPayment: expiredTrialsNoFailure || 0,
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
      // Checkout funnel
      checkoutCreatedInPeriod: checkoutCreatedInPeriod || 0,
      checkoutCompletedInPeriod: checkoutCompletedInPeriod || 0,
      checkoutDropoffInPeriod,
      checkoutCompletionRate,
      checkoutCreatedAllTime: checkoutCreatedAllTime || 0,
      checkoutCompletedAllTime: checkoutCompletedAllTime || 0,
      // Billing
      billingSuccessInPeriod,
      billingTotalInPeriod,
      billingSuccessRate,
      // Weekly Plans (Stripe)
      totalWeeklyPlans,
      weeklyPlansInPeriod,
      trialsCompletedWeek: weeklyPlansOver7d,
      weeklyPlansExpired,
      trialsToPaidSuccess: weeklyPlansToPaidSuccess,
      trialToPaidRate,
      // Cancellation (voluntary + involuntary)
      canceledInPeriod,
      voluntaryChurnInPeriod,
      involuntaryChurnInPeriod,
      pausedInPeriod: pausedInPeriodCount || 0,
      churnRate,
      voluntaryChurnRate,
      involuntaryChurnRate,
      churnRateLegacy,
      activeAtPeriodStart: activeAtPeriodStart || 0,
      paymentAtRiskCount: paymentAtRiskCount || 0,             // total past_due (≤7d + >7d)
      pastDueRecentCount,                                      // ≤7d
      pastDueCriticalCount,                                    // >7d (Stripe ainda tentando)
      involuntaryChurnLive: involuntaryChurnFromStripeCount,   // canceled por payment_failed nos últimos 30d (real do Stripe)
      voluntaryChurnLive: voluntaryChurnFromStripeCount,       // canceled por solicitação do usuário nos últimos 30d (Stripe Portal + UI)
      totalChurnFromStripe,                                    // soma real do Stripe nos últimos 30d
      stripeChurnReasons,                                      // breakdown por razão (Stripe)
      recoveryRate,
      totalPaymentFailedAllTime: totalPaymentFailedAllTime || 0,
      recoveredPayments: recoveredPayments || 0,
      cancellationReasons,
      internalCancellationReasons30d: internalReasonCounts30d,
      // 📊 Retenção por Coorte (Cohort Retention)
      cohortRetention,
      // 💰 Revenue & MRR (Stripe-sourced)
      mrrCommittedBRL,
      mrrWeeklyEquivBRL,
      mrrTotalBRL,
      mrrAtRiskBRL,
      mrrAtRiskRecentBRL,
      mrrAtRiskCriticalBRL,
      mrrAtRiskMonthlyBRL,
      mrrAtRiskWeeklyBRL,
      activeSubscriptionsCount,
      monthlyActiveSubscriptionsCount,
      weeklyActiveSubscriptionsCount,
      pastDueSubscriptionsCount,
      mrrBreakdown,
      // 🎯 Activation
      activationRate,
      activatedUsersCount: activatedUsers.length,
      payingUsersCount: payingUsers.length,
      silentPayersCount: silentPayers.length,
      // 📈 Mature trial conversion
      matureTrialsCount: matureTrials.length,
      matureConvertedCount: matureConverted.length,
      matureConversionRate,
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
