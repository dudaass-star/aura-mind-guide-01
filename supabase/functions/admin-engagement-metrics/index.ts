import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// 🚀 CACHE EM MEMÓRIA (módulo-level) — TTL 5 min
// ------------------------------------------------------------
// Reduz drasticamente a latência percebida quando o admin troca
// de aba ou reabre o dashboard. O botão "Atualizar" envia
// forceRefresh=true para invalidar e recomputar.
// ============================================================
const METRICS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const metricsCache = new Map<string, { expiresAt: number; payload: string }>();

// Janelas padrão pré-calculadas via snapshot (cron 5min → tabela admin_metrics_snapshots).
// Filtros customizados fora dessa lista caem no caminho ao vivo (compute + cache em memória).
const STANDARD_WINDOW_DAYS: Record<string, number> = {
  today: 0,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

/**
 * Retorna a chave da janela padrão (today|7d|14d|30d|90d) se o intervalo
 * dateFrom→dateTo casar com uma das janelas terminando HOJE (BRT). Caso
 * contrário retorna null (filtro customizado).
 */
function matchStandardWindow(dateFrom: string, dateTo: string): string | null {
  const today = new Date().toISOString().slice(0, 10);
  if (dateTo !== today) return null;
  for (const [key, days] of Object.entries(STANDARD_WINDOW_DAYS)) {
    const expectedFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    if (dateFrom === expectedFrom) return key;
  }
  return null;
}

function getCached(key: string): string | null {
  const hit = metricsCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    metricsCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCached(key: string, payload: string) {
  metricsCache.set(key, { expiresAt: Date.now() + METRICS_CACHE_TTL_MS, payload });
  // Limita tamanho do cache (evita memory leak em runs longos)
  if (metricsCache.size > 50) {
    const firstKey = metricsCache.keys().next().value;
    if (firstKey) metricsCache.delete(firstKey);
  }
}

// Helper genérico: roda promises em paralelo limitando concorrência
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

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

    // Auth: admin logado OU chamada interna (função snapshot) via segredo do vault.
    const providedInternal = req.headers.get('x-internal-secret');
    let isInternalCall = false;
    if (providedInternal) {
      const { data: secretValue } = await supabase.rpc('get_admin_metrics_snapshot_secret');
      isInternalCall = !!(secretValue && providedInternal === (secretValue as string));
    }

    if (!isInternalCall) {
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
    }

    // Parse date filters
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    let forceRefresh = false;
    try {
      const body = await req.json();
      dateFrom = body.dateFrom || null;
      dateTo = body.dateTo || null;
      forceRefresh = !!body.forceRefresh;
    } catch { /* no body */ }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const defaultTo = now.toISOString().slice(0, 10);

    // BRT-aligned period boundaries
    const { periodStart, periodEnd } = toBRTInterval(dateFrom || defaultFrom, dateTo || defaultTo);

    console.log(`📊 Period: ${periodStart} → ${periodEnd} (BRT-aligned)`);

    // ⚡ Cache check
    const cacheKey = `v2:${dateFrom || defaultFrom}:${dateTo || defaultTo}`;
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        console.log(`⚡ Cache HIT for ${cacheKey} (saved full computation)`);
        return new Response(cached, {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }
    } else {
      console.log(`🔄 Force refresh requested for ${cacheKey}`);
      metricsCache.delete(cacheKey);
    }

    // 📸 Snapshot check — janelas padrão são pré-calculadas por cron a cada 5 min.
    // Se o filtro casar com hoje/7d/14d/30d/90d e forceRefresh não for pedido,
    // devolvemos o snapshot direto (dashboard em <200ms). Consideramos stale
    // após 15 min por segurança (caso o cron falhe).
    const windowKey = matchStandardWindow(dateFrom || defaultFrom, dateTo || defaultTo);
    if (windowKey && !forceRefresh) {
      const { data: snap } = await supabase
        .from('admin_metrics_snapshots')
        .select('payload, computed_at')
        .eq('window_key', windowKey)
        .maybeSingle();
      if (snap?.payload) {
        const ageMs = Date.now() - new Date(snap.computed_at as string).getTime();
        if (ageMs < 15 * 60 * 1000) {
          console.log(`📸 Snapshot HIT window=${windowKey} age=${Math.round(ageMs / 1000)}s`);
          const payload = { ...(snap.payload as Record<string, unknown>), _snapshot_computed_at: snap.computed_at, _snapshot_window: windowKey };
          return new Response(JSON.stringify(payload), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'X-Cache': 'SNAPSHOT',
              'X-Snapshot-Age-Ms': String(ageMs),
            },
          });
        }
        console.log(`📸 Snapshot STALE window=${windowKey} age=${Math.round(ageMs / 1000)}s → recompute`);
      }
    }
    const computeStartedAt = Date.now();

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

    // Messages per session (sessions that ended in period) — OTIMIZADO
    // Em vez de N+1 (1 count por sessão), buscamos as mensagens dos usuários
    // alvo em UMA única paginação e classificamos em memória usando
    // started_at/ended_at de cada sessão.
    let messagesPerSession = 0;
    if (completedSessions && completedSessions.length > 0) {
      const sessionsByUser = new Map<string, typeof completedSessions>();
      for (const s of completedSessions) {
        if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, []);
        sessionsByUser.get(s.user_id)!.push(s);
      }

      const userIds = Array.from(sessionsByUser.keys());
      // Janela mínima/máxima entre todas as sessões — limita o range
      let minStart = completedSessions[0].started_at!;
      let maxEnd = completedSessions[0].ended_at!;
      for (const s of completedSessions) {
        if (s.started_at! < minStart) minStart = s.started_at!;
        if (s.ended_at! > maxEnd) maxEnd = s.ended_at!;
      }

      // Busca todas as mensagens user-role desses usuários no range em chunks de 100 user_ids
      const allMsgs: { user_id: string; created_at: string }[] = [];
      const CHUNK = 100;
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const chunk = userIds.slice(i, i + CHUNK);
        let page = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('messages')
            .select('user_id, created_at')
            .eq('role', 'user')
            .in('user_id', chunk)
            .gte('created_at', minStart)
            .lte('created_at', maxEnd)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) break;
          if (!data || data.length === 0) break;
          allMsgs.push(...(data as { user_id: string; created_at: string }[]));
          if (data.length < pageSize) break;
          page++;
        }
      }

      // Indexa por user_id e ordena por timestamp para classificar rápido por sessão
      const msgsByUser = new Map<string, string[]>();
      for (const m of allMsgs) {
        if (!msgsByUser.has(m.user_id)) msgsByUser.set(m.user_id, []);
        msgsByUser.get(m.user_id)!.push(m.created_at);
      }

      const userAverages: number[] = [];
      for (const [userId, sessions] of sessionsByUser) {
        const userMsgs = msgsByUser.get(userId) || [];
        let userTotalMsgs = 0;
        for (const session of sessions) {
          const start = session.started_at!;
          const end = session.ended_at!;
          for (const ts of userMsgs) {
            if (ts >= start && ts <= end) userTotalMsgs++;
          }
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
    // Stripe = fonte da verdade. Conta subs que estavam ATIVAS no início do período:
    //   created < periodStart AND (status active/trialing/past_due OU canceled_at >= periodStart)
    // Isso elimina o viés do denominador inflado (incluir quem já estava cancelado antes).
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    let activeAtPeriodStart = 0;
    let churnDenominatorSource: 'stripe' | 'db_fallback' = 'db_fallback';
    if (stripeKey) {
      try {
        const stripeChurnDenom = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
        const periodStartTs = Math.floor(new Date(periodStart).getTime() / 1000);
        // Buscar subs ativas/trialing/past_due criadas antes do período (todas vivas hoje)
        for (const status of ['active', 'trialing', 'past_due'] as const) {
          let hasMore = true;
          let startingAfter: string | undefined;
          while (hasMore) {
            const params: Stripe.SubscriptionListParams = {
              status,
              limit: 100,
              created: { lt: periodStartTs },
            };
            if (startingAfter) params.starting_after = startingAfter;
            const result = await stripeChurnDenom.subscriptions.list(params);
            activeAtPeriodStart += result.data.length;
            hasMore = result.has_more;
            if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
          }
        }
        // + canceladas que ainda estavam vivas em periodStart (canceled_at >= periodStart)
        // OTIMIZAÇÃO: limitamos a busca a subs criadas até 180 dias antes de periodStart
        // (subs mais antigas que 6 meses raramente são relevantes para o denominador
        //  e custavam centenas de chamadas Stripe).
        let hasMore = true;
        let startingAfter: string | undefined;
        let stop = false;
        const cancelLookbackTs = periodStartTs - 180 * 24 * 60 * 60;
        while (hasMore && !stop) {
          const params: Stripe.SubscriptionListParams = {
            status: 'canceled',
            limit: 100,
            created: { lt: periodStartTs, gte: cancelLookbackTs },
          };
          if (startingAfter) params.starting_after = startingAfter;
          const result = await stripeChurnDenom.subscriptions.list(params);
          for (const sub of result.data) {
            const canceledAt = sub.canceled_at || 0;
            if (canceledAt >= periodStartTs) {
              activeAtPeriodStart++;
            } else {
              // Stripe lista cancelled em ordem desc por created — paramos quando passa
              // do janela útil (otimização leve; mantemos correto pois filter já é por created)
              stop = true;
              break;
            }
          }
          hasMore = result.has_more && !stop;
          if (result.data.length > 0) startingAfter = result.data[result.data.length - 1].id;
        }
        churnDenominatorSource = 'stripe';
      } catch (err) {
        console.warn('⚠️ Stripe churn denominator failed, falling back to DB:', err);
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .lt('created_at', periodStart)
          .in('status', ['active', 'canceling', 'canceled', 'paused', 'trial_expired', 'inactive']);
        activeAtPeriodStart = count || 0;
      }
    } else {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', periodStart)
        .in('status', ['active', 'canceling', 'canceled', 'paused', 'trial_expired', 'inactive']);
      activeAtPeriodStart = count || 0;
    }

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

      // Check invoices directly in Stripe for customers >7d — PARALELIZADO
      // (10 requests Stripe simultâneas em vez de uma por uma)
      const invoiceResults = await runWithConcurrency(customersOver7d, 10, async (custId) => {
        try {
          const invoices = await stripe.invoices.list({ customer: custId, limit: 20 });
          const monthlyInvoices = invoices.data.filter(inv =>
            inv.billing_reason === 'subscription_cycle' &&
            (inv.total || 0) > 0 &&
            inv.status !== 'draft'
          );
          if (monthlyInvoices.length === 0) return { expired: false, paid: false };
          const hasPaidMonthly = monthlyInvoices.some(inv => inv.status === 'paid');
          return { expired: true, paid: hasPaidMonthly };
        } catch (e) {
          console.warn(`⚠️ Failed to fetch invoices for ${custId}:`, e);
          return { expired: false, paid: false };
        }
      });
      for (const r of invoiceResults) {
        if (r.expired) weeklyPlansExpired++;
        if (r.paid) weeklyPlansToPaidSuccess++;
      }
    }

    const trialToPaidRate = weeklyPlansExpired > 0
      ? Math.round(weeklyPlansToPaidSuccess / weeklyPlansExpired * 1000) / 10
      : 0;

    console.log(`📊 Weekly Plans: total=${totalWeeklyPlans}, >7d=${weeklyPlansOver7d}, expired=${weeklyPlansExpired}, converted=${weeklyPlansToPaidSuccess}, rate=${trialToPaidRate}%`);

    // ========== CHECKOUT FUNNEL METRICS (deduplicated by phone) ==========

    // Chave de identidade unificada: email lowercase OU últimos 11 dígitos do telefone.
    // Usada para deduplicar entre Stripe (checkout_sessions) e Asaas (asaas_payments).
    const identityKey = (email?: string | null, phone?: string | null): string | null => {
      const e = (email || '').trim().toLowerCase();
      if (e) return `e:${e}`;
      const digits = (phone || '').replace(/\D/g, '');
      if (!digits) return null;
      // Mantém últimos 11 dígitos (DDD + 9 + 8) — descarta prefixo 55
      const tail = digits.length > 11 ? digits.slice(-11) : digits;
      return `p:${tail}`;
    };

    // Fetch sessions in period (Stripe). Inclui email pra construir chave de identidade.
    const { data: periodSessions } = await supabase
      .from('checkout_sessions')
      .select('phone, email, status')
      .gte('created_at', periodStart)
      .lt('created_at', periodEnd);

    const stripeCreatedKeysInPeriod = new Set<string>();
    const stripeCompletedKeysInPeriod = new Set<string>();
    for (const s of (periodSessions || [])) {
      const k = identityKey(s.email as string | null, s.phone as string | null);
      if (!k) continue;
      stripeCreatedKeysInPeriod.add(k);
      if (s.status === 'completed') stripeCompletedKeysInPeriod.add(k);
    }

    // All-time checkout funnel (Stripe)
    const { data: allTimeSessions } = await supabase
      .from('checkout_sessions')
      .select('phone, email, status');

    const stripeCreatedKeysAllTime = new Set<string>();
    const stripeCompletedKeysAllTime = new Set<string>();
    for (const s of (allTimeSessions || [])) {
      const k = identityKey(s.email as string | null, s.phone as string | null);
      if (!k) continue;
      stripeCreatedKeysAllTime.add(k);
      if (s.status === 'completed') stripeCompletedKeysAllTime.add(k);
    }

    // Sets de chaves Asaas (preenchidos depois, dentro do bloco try/catch do Asaas).
    // Declarados aqui pra ficarem visíveis na hora de combinar.
    const asaasCreatedKeysInPeriod = new Set<string>();
    const asaasConfirmedKeysInPeriod = new Set<string>();
    const asaasCreatedKeysAllTime = new Set<string>();
    const asaasConfirmedKeysAllTime = new Set<string>();

    // Os totais por canal e combinados são calculados depois (após popular Asaas),
    // descartando "created" Stripe quando o mesmo identityKey aparece pago no Asaas
    // e vice-versa. Inicializamos com a contagem bruta como fallback.
    let checkoutCreatedInPeriod = stripeCreatedKeysInPeriod.size;
    let checkoutCompletedInPeriod = stripeCompletedKeysInPeriod.size;
    let checkoutCreatedAllTime = stripeCreatedKeysAllTime.size;
    let checkoutCompletedAllTime = stripeCompletedKeysAllTime.size;
    let checkoutDropoffInPeriod = checkoutCreatedInPeriod - checkoutCompletedInPeriod;
    let checkoutCompletionRate = checkoutCreatedInPeriod > 0
      ? Math.round(checkoutCompletedInPeriod / checkoutCreatedInPeriod * 1000) / 10
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
          // Usa preço REAL do Stripe (respeita cupons, preços legados, A/B).
          // Fallback para hardcoded só se Stripe não retornar amount.
          const price = sub.items.data[0]?.price?.unit_amount || PLAN_PRICES_MONTHLY[plan] || 0;
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
    // 📊 RETENÇÃO POR COORTE (Cohort Retention) — JANELAS DISCRETAS
    // ============================================================
    // Cada bucket representa uma JANELA específica do ciclo de vida da assinatura:
    //   - churn0_7:   dropoff inicial (trial → 1ª cobrança)
    //   - churn8_30:  1º ciclo mensal completo
    //   - churn31_60: 🔥 RENOVAÇÃO 2ª MENSALIDADE (teste do "valor real")
    //   - churn61_90: 3ª mensalidade
    //
    // Para cada janela [startDay, endDay]:
    //   - total: subs que SOBREVIVERAM até startDay E têm idade ≥ endDay
    //            (ou seja: chegaram vivas no início da janela e tiveram tempo
    //             suficiente para serem testadas pela janela inteira)
    //   - canceled: dessas, quantas cancelaram DENTRO de [startDay, endDay]
    //   - pct: % de churn DA JANELA (não cumulativo)
    // ------------------------------------------------------------
    type CohortBucket = { total: number; canceled: number; pct: number };
    const cohortRetention: Record<string, CohortBucket> = {
      churn0_7: { total: 0, canceled: 0, pct: 0 },
      churn8_30: { total: 0, canceled: 0, pct: 0 },
      churn31_60: { total: 0, canceled: 0, pct: 0 },
      churn61_90: { total: 0, canceled: 0, pct: 0 },
    };

    // 📈 MRR Growth (30d) + Tempo médio até churn (90d)
    // Calculados na MESMA passada do cohort para evitar custo extra na API do Stripe.
    let newMRRCents = 0;          // MRR de subs criadas nos últimos 30d que estão ativas/trialing/past_due
    let churnedMRRCents = 0;      // MRR perdido (subs canceladas nos últimos 30d)
    let churnedSubsCount90d = 0;  // # subs canceladas nos últimos 90d (excluindo D0)
    let churnedDaysSum90d = 0;    // soma de dias-de-vida das canceladas nos últimos 90d

    if (stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
        const DAY = 24 * 60 * 60;
        const nowTs = Math.floor(Date.now() / 1000);
        // Janela: últimos 180 dias para garantir dados de 90d+
        const windowStartTs = nowTs - 180 * DAY;
        const thirtyDaysAgoTs = nowTs - 30 * DAY;
        const ninetyDaysAgoTs = nowTs - 90 * DAY;

        const buckets = [
          { key: 'churn0_7',   start: 0,  end: 7 },
          { key: 'churn8_30',  start: 8,  end: 30 },
          { key: 'churn31_60', start: 31, end: 60 },
          { key: 'churn61_90', start: 61, end: 90 },
        ];

        // Helper: normaliza unit_amount para MRR mensal em cents conforme cycle
        const toMonthlyCents = (sub: Stripe.Subscription): number => {
          const priceId = sub.items.data[0]?.price?.id;
          const mapping = priceId ? priceToPlan[priceId] : undefined;
          const realAmount = sub.items.data[0]?.price?.unit_amount || 0;
          if (!mapping) return realAmount; // fallback: assume mensal
          if (mapping.cycle === 'monthly') return realAmount;
          if (mapping.cycle === 'yearly') return Math.round(realAmount / 12);
          if (mapping.cycle === 'weekly') return Math.round(realAmount * 4.33);
          // 'trialing' em preço mensal = semanal economicamente
          if (sub.status === 'trialing') {
            const weeklyPrice = WEEKLY_PRICES[mapping.plan] || 0;
            return Math.round(weeklyPrice * 4.33);
          }
          return realAmount;
        };

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

            // ---- Cohort Retention ----
            for (const { key, start, end } of buckets) {
              const matureForWindow = ageDays >= end;
              const survivedToWindowStart =
                lifetimeDays === null || lifetimeDays >= start;

              if (matureForWindow && survivedToWindowStart) {
                cohortRetention[key].total++;
                if (
                  lifetimeDays !== null &&
                  lifetimeDays >= start &&
                  lifetimeDays <= end
                ) {
                  cohortRetention[key].canceled++;
                }
              }
            }

            // ---- MRR Growth (30d) ----
            // newMRR: subs criadas nos últimos 30d que continuam vivas
            const isAlive = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
            if (isAlive && createdTs >= thirtyDaysAgoTs) {
              newMRRCents += toMonthlyCents(sub);
            }
            // churnedMRR: subs canceladas nos últimos 30d
            if (canceledTs > 0 && canceledTs >= thirtyDaysAgoTs) {
              churnedMRRCents += toMonthlyCents(sub);
            }

            // ---- Tempo médio até churn (90d) ----
            // Excluir cancelamentos D0 (lifetimeDays < 1) que tipicamente são lixo/duplicatas
            if (
              canceledTs > 0 &&
              canceledTs >= ninetyDaysAgoTs &&
              lifetimeDays !== null &&
              lifetimeDays >= 1
            ) {
              churnedSubsCount90d++;
              churnedDaysSum90d += lifetimeDays;
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

        console.log(`📊 Cohort Retention windows (processed ${processedCount} subs):`, JSON.stringify(cohortRetention));
        console.log(`📈 MRR Growth 30d: new=${newMRRCents/100} churned=${churnedMRRCents/100} | avg days to churn (90d): ${churnedSubsCount90d > 0 ? Math.round(churnedDaysSum90d/churnedSubsCount90d) : 0} (n=${churnedSubsCount90d})`);
      } catch (e) {
        console.warn('⚠️ Failed to compute cohort retention / MRR growth:', e);
      }
    }

    // ============================================================
    // 💠 ASAAS / PIX — unificação com métricas Stripe
    // ------------------------------------------------------------
    // PIX não tem assinatura recorrente automática nem trial semanal.
    // Tratamos cada pagamento CONFIRMED/RECEIVED como receita do ciclo
    // (monthly/quarterly/yearly normalizados para mensal equivalente).
    // Excluímos contas de teste E2E pra não inflar a métrica.
    // ============================================================
    let asaasMrrCents = 0;
    let asaasActiveUsersCount = 0;
    let asaasCheckoutCreatedInPeriod = 0;
    let asaasCheckoutConfirmedInPeriod = 0;
    let asaasCheckoutCreatedAllTime = 0;
    let asaasCheckoutConfirmedAllTime = 0;
    let asaasChurnCount = 0;
    const PAID_STATUSES = ['CONFIRMED', 'RECEIVED'];
    const E2E_EMAIL_PATTERN = 'e2e+%@olaaura.com.br';

    try {
      // Janela de "ativo": último pagamento dentro do ciclo vigente.
      // monthly = 35d, quarterly = 100d, yearly = 380d (margem pra atraso).
      const nowMs = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const monthlyCutoff = new Date(nowMs - 35 * DAY_MS).toISOString();
      const quarterlyCutoff = new Date(nowMs - 100 * DAY_MS).toISOString();
      const yearlyCutoff = new Date(nowMs - 380 * DAY_MS).toISOString();
      const churnCutoff = new Date(nowMs - 35 * DAY_MS).toISOString();

      // 1) Pagamentos pagos para MRR + Active users
      const { data: asaasPaidPayments } = await supabase
        .from('asaas_payments')
        .select('customer_email, plan, billing_period, amount_cents, paid_at, status')
        .in('status', PAID_STATUSES)
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN)
        .order('paid_at', { ascending: false })
        .limit(2000);

      // Active users: 1 entry mais recente por email dentro do ciclo vigente
      const lastPaidByEmail = new Map<string, { paid_at: string; billing_period: string; amount_cents: number }>();
      for (const p of asaasPaidPayments || []) {
        if (!p.customer_email || !p.paid_at) continue;
        const existing = lastPaidByEmail.get(p.customer_email);
        if (!existing || (p.paid_at as string) > existing.paid_at) {
          lastPaidByEmail.set(p.customer_email, {
            paid_at: p.paid_at as string,
            billing_period: (p.billing_period as string) || 'monthly',
            amount_cents: (p.amount_cents as number) || 0,
          });
        }
      }

      for (const { paid_at, billing_period, amount_cents } of lastPaidByEmail.values()) {
        const cutoff =
          billing_period === 'yearly' ? yearlyCutoff :
          billing_period === 'quarterly' ? quarterlyCutoff :
          monthlyCutoff;
        if (paid_at < cutoff) continue; // expirou — não conta como ativo

        asaasActiveUsersCount++;
        if (billing_period === 'yearly') {
          asaasMrrCents += Math.round(amount_cents / 12);
        } else if (billing_period === 'quarterly') {
          asaasMrrCents += Math.round(amount_cents / 3);
        } else {
          asaasMrrCents += amount_cents;
        }
      }

      // 2) Funil de checkout PIX no período
      // Criados: conta por created_at (intenção de pagar via PIX no período)
      // IMPORTANTE: o funil de "checkout abandonado" mede SOMENTE novos clientes que
      // iniciaram pagamento pelo site. Renovações automáticas geradas pela recorrência
      // Asaas (2ª+ cobrança de uma mesma subscription) NÃO entram aqui — para isso
      // existem outros indicadores (MRR, ativos, churn).
      // Estratégia: identificar o ID do PRIMEIRO pagamento de cada subscription e
      // descartar qualquer linha cujo id não seja esse "primeiro".
      const { data: asaasSubFirstScan } = await supabase
        .from('asaas_payments')
        .select('id, asaas_subscription_id, created_at')
        .not('asaas_subscription_id', 'is', null)
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN)
        .order('created_at', { ascending: true })
        .limit(5000);

      const firstPaymentIdBySub = new Map<string, string>();
      for (const r of asaasSubFirstScan || []) {
        const sub = r.asaas_subscription_id as string | null;
        if (!sub) continue;
        if (!firstPaymentIdBySub.has(sub)) firstPaymentIdBySub.set(sub, r.id as string);
      }
      const isRenewal = (row: { id: string; asaas_subscription_id: string | null }): boolean => {
        const sub = row.asaas_subscription_id;
        if (!sub) return false; // PIX one-shot sem subscription nunca é renovação
        const firstId = firstPaymentIdBySub.get(sub);
        return !!firstId && firstId !== row.id;
      };

      // Linhas órfãs: PIX Automático Bacen pode gravar o pagamento sem
      // asaas_subscription_id mesmo quando o payload cru traz `subscription`.
      // Sem esse resgate, a renovação vira "venda nova" no funil.
      const { data: orphanRows } = await supabase
        .from('asaas_payments')
        .select('id, raw_payload')
        .is('asaas_subscription_id', null)
        .or(`created_at.gte.${periodStart},paid_at.gte.${periodStart}`)
        .limit(2000);
      const rawSubById = new Map<string, string>();
      for (const r of orphanRows || []) {
        const sub = (r.raw_payload as Record<string, unknown> | null)?.subscription as string | undefined;
        if (sub) rawSubById.set(r.id as string, sub);
      }

      // Identidades que já pagaram ANTES do período — qualquer pagamento delas
      // dentro do período é renovação, não conversão de checkout novo.
      const { data: paidBeforePeriod } = await supabase
        .from('asaas_payments')
        .select('customer_email, customer_phone')
        .in('status', PAID_STATUSES)
        .lt('paid_at', periodStart)
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN)
        .limit(10000);
      const paidBeforeKeys = new Set<string>();
      for (const r of paidBeforePeriod || []) {
        const k = identityKey(r.customer_email as string | null, r.customer_phone as string | null);
        if (k) paidBeforeKeys.add(k);
      }

      // Autorizações PIX Automático Bacen criadas ANTES do período: qualquer
      // cobrança do ciclo delas dentro do período é renovação, mesmo que seja
      // a 1ª linha gravada em asaas_payments daquela subscription.
      const { data: authsBeforePeriod } = await supabase
        .from('asaas_pix_authorizations')
        .select('asaas_subscription_id, asaas_customer_id, created_at, status')
        .lt('created_at', periodStart)
        .eq('status', 'ACTIVE')
        .limit(5000);
      const recurringSubsBefore = new Set<string>();
      const recurringCustomersBefore = new Set<string>();
      for (const a of authsBeforePeriod || []) {
        const sub = a.asaas_subscription_id as string | null;
        const cus = a.asaas_customer_id as string | null;
        if (sub) recurringSubsBefore.add(sub);
        if (cus) recurringCustomersBefore.add(cus);
      }

      // Renovação no recorte do período: regra base + payload cru + histórico pago
      // + autorização recorrente anterior ao período.
      const isRenewalInPeriod = (row: {
        id: string;
        asaas_subscription_id: string | null;
        customer_email?: string | null;
        customer_phone?: string | null;
        asaas_customer_id?: string | null;
      }): boolean => {
        const effectiveSub = row.asaas_subscription_id || rawSubById.get(row.id) || null;
        if (isRenewal({ id: row.id, asaas_subscription_id: effectiveSub })) return true;
        if (effectiveSub && recurringSubsBefore.has(effectiveSub)) return true;
        if (row.asaas_customer_id && recurringCustomersBefore.has(row.asaas_customer_id)) return true;
        // Linha órfã com subscription no payload cru: não é primeiro pagamento
        // rastreável — trata como renovação se a identidade já pagou antes.
        const k = identityKey(row.customer_email ?? null, row.customer_phone ?? null);
        if (k && paidBeforeKeys.has(k)) return true;
        return false;
      };

      const { data: asaasCreatedInPeriod } = await supabase
        .from('asaas_payments')
        .select('id, customer_email, customer_phone, asaas_subscription_id, asaas_customer_id')
        .gte('created_at', periodStart)
        .lt('created_at', periodEnd)
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN);

      const pixCreatedEmails = new Set<string>();
      for (const p of asaasCreatedInPeriod || []) {
        if (isRenewalInPeriod({
          id: p.id as string,
          asaas_subscription_id: p.asaas_subscription_id as string | null,
          customer_email: p.customer_email as string | null,
          customer_phone: p.customer_phone as string | null,
          asaas_customer_id: p.asaas_customer_id as string | null,
        })) continue;
        const em = (p.customer_email as string | null) || `__nokey_${p.id}`;
        pixCreatedEmails.add(em);
        const k = identityKey(p.customer_email as string | null, p.customer_phone as string | null);
        if (k) asaasCreatedKeysInPeriod.add(k);
      }
      asaasCheckoutCreatedInPeriod = pixCreatedEmails.size;

      // Confirmados: conta por paid_at (dinheiro entrou no período, mesmo se PIX criado antes)
      const { data: asaasConfirmedInPeriod } = await supabase
        .from('asaas_payments')
        .select('id, customer_email, customer_phone, paid_at, status, asaas_subscription_id, asaas_customer_id')
        .in('status', PAID_STATUSES)
        .gte('paid_at', periodStart)
        .lt('paid_at', periodEnd)
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN);

      const pixConfirmedEmails = new Set<string>();
      for (const p of asaasConfirmedInPeriod || []) {
        if (isRenewalInPeriod({
          id: p.id as string,
          asaas_subscription_id: p.asaas_subscription_id as string | null,
          customer_email: p.customer_email as string | null,
          customer_phone: p.customer_phone as string | null,
          asaas_customer_id: p.asaas_customer_id as string | null,
        })) continue;
        const em = (p.customer_email as string | null) || `__nokey_${p.id}`;
        pixConfirmedEmails.add(em);
        const k = identityKey(p.customer_email as string | null, p.customer_phone as string | null);
        if (k) asaasConfirmedKeysInPeriod.add(k);
      }
      asaasCheckoutConfirmedInPeriod = pixConfirmedEmails.size;

      // 2b) Funil all-time PIX (dedup por email pra alinhar com cartão)
      const { data: asaasAllTime } = await supabase
        .from('asaas_payments')
        .select('id, status, customer_email, customer_phone, asaas_subscription_id')
        .not('customer_email', 'ilike', E2E_EMAIL_PATTERN);

      const pixEmailsCreated = new Set<string>();
      const pixEmailsConfirmed = new Set<string>();
      for (const p of asaasAllTime || []) {
        if (isRenewal({ id: p.id as string, asaas_subscription_id: p.asaas_subscription_id as string | null })) continue;
        const em = (p.customer_email as string | null) || '';
        if (!em) continue;
        pixEmailsCreated.add(em);
        if (PAID_STATUSES.includes(p.status as string)) pixEmailsConfirmed.add(em);
        const k = identityKey(em, p.customer_phone as string | null);
        if (k) {
          asaasCreatedKeysAllTime.add(k);
          if (PAID_STATUSES.includes(p.status as string)) asaasConfirmedKeysAllTime.add(k);
        }
      }
      asaasCheckoutCreatedAllTime = pixEmailsCreated.size;
      asaasCheckoutConfirmedAllTime = pixEmailsConfirmed.size;

      // 3) Churn PIX: profile com asaas_customer_id, sem pagamento confirmado nos últimos 35d
      const { data: asaasProfiles } = await supabase
        .from('profiles')
        .select('user_id, email')
        .not('asaas_customer_id', 'is', null);

      for (const prof of asaasProfiles || []) {
        const email = prof.email as string | null;
        if (!email) continue;
        if (email.startsWith('e2e+') && email.endsWith('@olaaura.com.br')) continue;
        const last = lastPaidByEmail.get(email);
        if (!last || last.paid_at < churnCutoff) {
          asaasChurnCount++;
        }
      }

      console.log(`💠 Asaas/PIX: active=${asaasActiveUsersCount}, mrr=R$${(asaasMrrCents/100).toFixed(2)}, checkout(${asaasCheckoutCreatedInPeriod}→${asaasCheckoutConfirmedInPeriod}), churn=${asaasChurnCount}`);
    } catch (e) {
      console.warn('⚠️ Falha ao computar métricas Asaas:', e);
    }

    const mrrPixBRL = Math.round(asaasMrrCents / 100 * 100) / 100;

    // ---------- PIX Automático (Bacen): saúde da autorização recorrente ----------
    // A etapa que mais perdemos é o consentimento no app do banco. Aqui medimos
    // criadas × ativadas × perdidas no período + débitos que não dispararam.
    const pixAuto = {
      createdInPeriod: 0,
      activatedInPeriod: 0,
      lostInPeriod: 0,
      pendingNow: 0,
      activeTotal: 0,
      authorizationRate: 0,
      autodebitFailures: [] as Array<Record<string, unknown>>,
    };
    try {
      const { data: authRows } = await supabase
        .from('asaas_pix_authorizations')
        .select('id, status, plan, customer_email, created_at, activated_at, asaas_subscription_id, autodebit_alert_sent_at');

      const inPeriod = (ts: string | null) =>
        !!ts && ts >= periodStart && ts < periodEnd;

      for (const a of authRows || []) {
        const status = String(a.status || '').toUpperCase();
        if (inPeriod(a.created_at as string | null)) pixAuto.createdInPeriod++;
        if (inPeriod(a.activated_at as string | null)) pixAuto.activatedInPeriod++;
        if (['REFUSED', 'EXPIRED', 'REJECTED'].includes(status) && !a.activated_at && inPeriod(a.created_at as string | null)) {
          pixAuto.lostInPeriod++;
        }
        if (status === 'ACTIVE') pixAuto.activeTotal++;
        if (!['ACTIVE', 'REFUSED', 'EXPIRED', 'REJECTED', 'CANCELLED'].includes(status)) {
          pixAuto.pendingNow++;
        }
        // Débito que não disparou: autorização ativa com alerta recente da auditoria.
        if (status === 'ACTIVE' && a.autodebit_alert_sent_at) {
          pixAuto.autodebitFailures.push({
            email: a.customer_email,
            plan: a.plan,
            alertedAt: a.autodebit_alert_sent_at,
            hasSubscription: !!a.asaas_subscription_id,
          });
        }
      }
      pixAuto.authorizationRate = pixAuto.createdInPeriod > 0
        ? Math.round(pixAuto.activatedInPeriod / pixAuto.createdInPeriod * 1000) / 10
        : 0;
      console.log(`🔁 PIX Automático: criadas=${pixAuto.createdInPeriod}, ativadas=${pixAuto.activatedInPeriod}, perdidas=${pixAuto.lostInPeriod}, taxa=${pixAuto.authorizationRate}%`);
    } catch (e) {
      console.warn('⚠️ Falha ao computar métricas de PIX Automático:', e);
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

    // 📊 Derivadas (Fase 2): ARR, ARPU, MRR Growth, Margem, Tempo até churn
    const arrBRL = Math.round(mrrTotalBRL * 12 * 100) / 100;
    const arpuBRL = activeSubscriptionsCount > 0
      ? Math.round((mrrTotalBRL / activeSubscriptionsCount) * 100) / 100
      : 0;
    const newMRRBRL = Math.round(newMRRCents / 100 * 100) / 100;
    const churnedMRRBRL = Math.round(churnedMRRCents / 100 * 100) / 100;
    const mrrGrowthBRL = Math.round((newMRRBRL - churnedMRRBRL) * 100) / 100;
    // Aproximação: MRR no início do período = MRR atual − novo + churned
    const mrrAtPeriodStartBRL = Math.max(0, Math.round((mrrTotalBRL - newMRRBRL + churnedMRRBRL) * 100) / 100);
    const mrrGrowthPct = mrrAtPeriodStartBRL > 0
      ? Math.round((mrrGrowthBRL / mrrAtPeriodStartBRL) * 1000) / 10
      : 0;
    // Normaliza custo do período para escala mensal (30d), para bater com MRR mensal
    const totalCostMonthlyBRL = periodDays > 0
      ? Math.round((totalCostBRL / periodDays) * 30 * 100) / 100
      : 0;
    const grossMarginBRL = Math.round((mrrTotalBRL - totalCostMonthlyBRL) * 100) / 100;
    const grossMarginPct = mrrTotalBRL > 0
      ? Math.round((grossMarginBRL / mrrTotalBRL) * 1000) / 10
      : 0;
    const avgDaysUntilChurn = churnedSubsCount90d > 0
      ? Math.round(churnedDaysSum90d / churnedSubsCount90d)
      : 0;

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

    // Fetch FIRST user message per user — filtra por payingUserIds em chunks de 100
    // para evitar varrer toda a tabela `messages` (escala com a base de pagantes, não com o total).
    const firstMsgByUser = new Map<string, string>();
    if (payingUserIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < payingUserIds.length; i += CHUNK) {
        const chunk = payingUserIds.slice(i, i + CHUNK);
        let page = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('messages')
            .select('user_id, created_at')
            .eq('role', 'user')
            .in('user_id', chunk)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const m of data) {
            const uid = m.user_id as string;
            const ts = m.created_at as string;
            const existing = firstMsgByUser.get(uid);
            if (!existing || ts < existing) {
              firstMsgByUser.set(uid, ts);
            }
          }
          if (data.length < pageSize) break;
          page++;
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

    // ========== 🔄 DEDUP CROSS-CHANNEL CHECKOUT ==========
    // Quando o mesmo cliente abre cartão (Stripe) e paga via PIX (Asaas),
    // ele aparecia 2x no funil — 1 como "criou" em cada canal e 1 como
    // "abandonou" no Stripe (que ficou em `created`). Aqui descartamos
    // Stripe-`created` cujo identityKey já confirmou em Asaas, e Asaas-`created`
    // cujo identityKey já completou no Stripe. Totais combinados = união.
    const stripeCreatedDedupInPeriod = new Set(
      [...stripeCreatedKeysInPeriod].filter(
        (k) => !asaasConfirmedKeysInPeriod.has(k) || stripeCompletedKeysInPeriod.has(k)
      )
    );
    const asaasCreatedDedupInPeriod = new Set(
      [...asaasCreatedKeysInPeriod].filter(
        (k) => !stripeCompletedKeysInPeriod.has(k) || asaasConfirmedKeysInPeriod.has(k)
      )
    );
    const stripeCreatedDedupAllTime = new Set(
      [...stripeCreatedKeysAllTime].filter(
        (k) => !asaasConfirmedKeysAllTime.has(k) || stripeCompletedKeysAllTime.has(k)
      )
    );
    const asaasCreatedDedupAllTime = new Set(
      [...asaasCreatedKeysAllTime].filter(
        (k) => !stripeCompletedKeysAllTime.has(k) || asaasConfirmedKeysAllTime.has(k)
      )
    );

    // Sobrescreve as contagens por canal já descontando o cross-channel
    checkoutCreatedInPeriod = stripeCreatedDedupInPeriod.size;
    checkoutCompletedInPeriod = stripeCompletedKeysInPeriod.size;
    checkoutCreatedAllTime = stripeCreatedDedupAllTime.size;
    checkoutCompletedAllTime = stripeCompletedKeysAllTime.size;
    asaasCheckoutCreatedInPeriod = asaasCreatedDedupInPeriod.size;
    asaasCheckoutCreatedAllTime = asaasCreatedDedupAllTime.size;

    // Totais combinados = união (dedup entre canais)
    const createdTotalInPeriodSet = new Set([...stripeCreatedDedupInPeriod, ...asaasCreatedDedupInPeriod]);
    const completedTotalInPeriodSet = new Set([...stripeCompletedKeysInPeriod, ...asaasConfirmedKeysInPeriod]);
    const createdTotalAllTimeSet = new Set([...stripeCreatedDedupAllTime, ...asaasCreatedDedupAllTime]);
    const completedTotalAllTimeSet = new Set([...stripeCompletedKeysAllTime, ...asaasConfirmedKeysAllTime]);

    checkoutDropoffInPeriod = checkoutCreatedInPeriod - checkoutCompletedInPeriod;
    checkoutCompletionRate = checkoutCreatedInPeriod > 0
      ? Math.round(checkoutCompletedInPeriod / checkoutCreatedInPeriod * 1000) / 10
      : 0;

    const stripeSuppressedByAsaas = stripeCreatedKeysInPeriod.size - stripeCreatedDedupInPeriod.size;
    const asaasSuppressedByStripe = asaasCreatedKeysInPeriod.size - asaasCreatedDedupInPeriod.size;
    console.log(`🔄 [checkout-dedup] period: Stripe-created suprimidos por pagamento Asaas=${stripeSuppressedByAsaas}, Asaas-created suprimidos por completed Stripe=${asaasSuppressedByStripe}`);

    // 🛡️ Higiene de interpretação — KPI "Correções por usuário / semana"
    // Fonte: user_memory_corrections (correções que o usuário fez sobre leituras
    // erradas da Aura). Serve como métrica de qualidade de vínculo — quanto
    // menor, menos momentos "ela não me entende".
    // Calcula (a) janela do request e (b) breakdown das últimas 8 semanas.
    let correctionsTotalInPeriod = 0;
    let correctionsUsersInPeriod = 0;
    let correctionsPerUserInPeriod = 0;
    let correctionsWeekly: { week: string; total: number; users: number; per_user: number }[] = [];
    try {
      // Paginado: o PostgREST corta em 1000 linhas por request. Sem paginação,
      // janelas longas (90d) travavam o total exatamente em 1000 e subestimavam o KPI.
      const correctionsRows: { user_id: string }[] = [];
      const CORR_PAGE = 1000;
      for (let page = 0; page < 50; page++) {
        const { data } = await supabase
          .from('user_memory_corrections')
          .select('user_id, created_at')
          .gte('created_at', periodStart)
          .lte('created_at', periodEnd)
          .range(page * CORR_PAGE, (page + 1) * CORR_PAGE - 1);
        if (!data || data.length === 0) break;
        correctionsRows.push(...(data as { user_id: string }[]));
        if (data.length < CORR_PAGE) break;
      }
      if (correctionsRows.length > 0) {
        correctionsTotalInPeriod = correctionsRows.length;
        correctionsUsersInPeriod = new Set(correctionsRows.map(r => r.user_id)).size;
        correctionsPerUserInPeriod = correctionsUsersInPeriod > 0
          ? Math.round((correctionsTotalInPeriod / correctionsUsersInPeriod) * 100) / 100
          : 0;
      }


      // Breakdown 8 semanas — usa data fixa (não depende de dateFrom/To do request).
      // Também paginado pelo mesmo motivo do bloco acima.
      const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
      const weeklyRows: { user_id: string; created_at: string }[] = [];
      for (let page = 0; page < 50; page++) {
        const { data } = await supabase
          .from('user_memory_corrections')
          .select('user_id, created_at')
          .gte('created_at', eightWeeksAgo.toISOString())
          .range(page * CORR_PAGE, (page + 1) * CORR_PAGE - 1);
        if (!data || data.length === 0) break;
        weeklyRows.push(...(data as { user_id: string; created_at: string }[]));
        if (data.length < CORR_PAGE) break;
      }
      if (weeklyRows.length > 0) {

        // Agrupa por segunda-feira BRT (date_trunc('week') no Postgres = Mon).
        const buckets = new Map<string, { total: number; users: Set<string> }>();
        for (const r of weeklyRows) {
          const d = new Date(r.created_at as string);
          // Segunda-feira BRT: shift para UTC-3, então back-shift para segunda.
          const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
          const dow = brt.getUTCDay(); // 0=Dom, 1=Seg...
          const daysSinceMon = (dow + 6) % 7;
          const weekStart = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() - daysSinceMon));
          const key = weekStart.toISOString().slice(0, 10);
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { total: 0, users: new Set() };
            buckets.set(key, bucket);
          }
          bucket.total += 1;
          bucket.users.add(r.user_id as string);
        }
        correctionsWeekly = [...buckets.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, b]) => ({
            week,
            total: b.total,
            users: b.users.size,
            per_user: b.users.size > 0 ? Math.round((b.total / b.users.size) * 100) / 100 : 0,
          }));
      }
    } catch (e) {
      console.warn('⚠️ Falha ao calcular métricas de correções (não crítico):', e);
    }

    // 🧭 Fechamento de sessão — % dialogada vs unilateral vs no-show.
    // Fonte: sessions.closure_mode gravado pelo aura-agent (dialogada) e
    // pelo session-reminder (unilateral/no_show). Serve como termômetro
    // contínuo da qualidade de aterrissagem das sessões.
    let closureDialogada = 0;
    let closureUnilateral = 0;
    let closureNoShow = 0;
    let closureTotal = 0;
    let closureDialogadaPct = 0;
    let closureUnilateralPct = 0;
    let closureNoShowPct = 0;
    try {
      // Paginado (limite de 1000 linhas do PostgREST).
      const closureRows: { closure_mode: string }[] = [];
      for (let page = 0; page < 50; page++) {
        const { data } = await supabase
          .from('sessions')
          .select('closure_mode')
          .gte('ended_at', periodStart)
          .lte('ended_at', periodEnd)
          .not('closure_mode', 'is', null)
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        closureRows.push(...(data as { closure_mode: string }[]));
        if (data.length < 1000) break;
      }
      if (closureRows.length > 0) {

        for (const r of closureRows) {
          const m = (r as any).closure_mode as string;
          if (m === 'dialogada') closureDialogada++;
          else if (m === 'unilateral') closureUnilateral++;
          else if (m === 'no_show') closureNoShow++;
        }
        closureTotal = closureDialogada + closureUnilateral + closureNoShow;
        if (closureTotal > 0) {
          closureDialogadaPct = Math.round((closureDialogada / closureTotal) * 1000) / 10;
          closureUnilateralPct = Math.round((closureUnilateral / closureTotal) * 1000) / 10;
          closureNoShowPct = Math.round((closureNoShow / closureTotal) * 1000) / 10;
        }
      }
    } catch (e) {
      console.warn('⚠️ Falha ao calcular closure metrics (não crítico):', e);
    }

    const responsePayload = JSON.stringify({
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
      // 💠 Asaas / PIX (somados separadamente para visibilidade)
      asaasCheckoutCreatedInPeriod,
      asaasCheckoutConfirmedInPeriod,
      checkoutCreatedTotalInPeriod: createdTotalInPeriodSet.size,
      checkoutCompletedTotalInPeriod: completedTotalInPeriodSet.size,
      asaasCheckoutCreatedAllTime,
      asaasCheckoutConfirmedAllTime,
      // 🔁 PIX Automático (Bacen)
      pixAuto,
      checkoutCreatedTotalAllTime: createdTotalAllTimeSet.size,
      checkoutCompletedTotalAllTime: completedTotalAllTimeSet.size,
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
      churnDenominatorSource,                                  // 'stripe' (preferido) ou 'db_fallback'
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
      // 💠 Asaas / PIX MRR (somado ao total Stripe via mrrGrandTotalBRL)
      mrrPixBRL,
      mrrGrandTotalBRL: Math.round((mrrTotalBRL + mrrPixBRL) * 100) / 100,
      asaasActiveUsersCount,
      activeSubscriptionsTotalCount: activeSubscriptionsCount + asaasActiveUsersCount,
      asaasChurnCount,
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
      // 🚀 Fase 2: derivadas de receita
      arrBRL,
      arpuBRL,
      mrrGrowthBRL,
      mrrGrowthPct,
      newMRRBRL,
      churnedMRRBRL,
      mrrAtPeriodStartBRL,
      grossMarginBRL,
      grossMarginPct,
      totalCostMonthlyBRL,
      periodDays,
      avgDaysUntilChurn,
      churnedSubsCount90d,
      // 🎯 Activation
      activationRate,
      activatedUsersCount: activatedUsers.length,
      payingUsersCount: payingUsers.length,
      silentPayersCount: silentPayers.length,
      // 📈 Mature trial conversion
      matureTrialsCount: matureTrials.length,
      matureConvertedCount: matureConverted.length,
      matureConversionRate,
      // 🛡️ Higiene de interpretação
      correctionsTotalInPeriod,
      correctionsUsersInPeriod,
      correctionsPerUserInPeriod,
      correctionsWeekly,
      // 🧭 Fechamento de sessão
      closureTotal,
      closureDialogada,
      closureUnilateral,
      closureNoShow,
      closureDialogadaPct,
      closureUnilateralPct,
      closureNoShowPct,
    });

    // Salva no cache para próximas requests dentro do TTL
    setCached(cacheKey, responsePayload);
    const elapsedMs = Date.now() - computeStartedAt;
    console.log(`✅ Computed metrics in ${elapsedMs}ms (cached as ${cacheKey})`);

    // 📸 Persiste no snapshot se casar com janela padrão (cron 5min também usa este caminho).
    if (windowKey) {
      try {
        const payloadObj = JSON.parse(responsePayload);
        await supabase
          .from('admin_metrics_snapshots')
          .upsert({
            window_key: windowKey,
            date_from: dateFrom || defaultFrom,
            date_to: dateTo || defaultTo,
            payload: payloadObj,
            computed_at: new Date().toISOString(),
            compute_ms: elapsedMs,
          }, { onConflict: 'window_key' });
        console.log(`📸 Snapshot upserted window=${windowKey} compute_ms=${elapsedMs}`);
      } catch (e) {
        console.warn('⚠️ Falha ao gravar snapshot (não crítico):', e);
      }
    }

    return new Response(responsePayload, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS', 'X-Compute-Ms': String(elapsedMs) },
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
