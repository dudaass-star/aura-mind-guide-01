import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Parse date filters from request body
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    try {
      const body = await req.json();
      dateFrom = body.dateFrom || null;
      dateTo = body.dateTo || null;
    } catch { /* no body, use defaults */ }

    const now = new Date();
    const periodStart = dateFrom || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = dateTo || now.toISOString();
    const periodStartDate = periodStart.slice(0, 10);
    const periodEndDate = periodEnd.slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ========== ENGAGEMENT METRICS ==========

    // 1. Active users count (base)
    const { count: activeUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // 1b. Active users in selected period
    const { count: activeUsersInPeriod } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_message_date', periodStartDate)
      .lte('last_message_date', periodEndDate);

    // 2. Messages in period
    const { count: weeklyMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    // 3. Completed sessions in period
    const { data: weeklySessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('status', 'completed')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    const weeklySessionsCount = weeklySessions?.length || 0;

    // 4. Average session duration (selected period)
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

    // 5. Messages per session
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

    // 6. Return rate in selected period
    const uniqueRecentUsers = activeUsersInPeriod || 0;
    const returnRate = activeUsers && activeUsers > 0
      ? Math.round(uniqueRecentUsers / activeUsers * 100)
      : 0;

    // Average daily messages per user (based on period length)
    const periodDays = Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)));
    const avgDailyMessagesPerUser = activeUsers && activeUsers > 0
      ? Math.round((weeklyMessages || 0) / periodDays / activeUsers * 10) / 10
      : 0;

    // ========== TRIAL & CONVERSION METRICS (filtered by period) ==========

    // Active trials that started in period
    const { count: activeTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd);

    // Trials started in period (same as above but all statuses)
    const { count: trialsLast7Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd);

    // Trials started in last 30 days (keep as reference)
    const { count: trialsLast30Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', thirtyDaysAgo);

    // Total trials in selected period
    const { count: totalTrialsEver } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd);

    // Converted in period: status = active AND trial started in period
    const { data: convertedProfiles } = await supabase
      .from('profiles')
      .select('trial_started_at, created_at, trial_conversations_count')
      .eq('status', 'active')
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .gt('trial_conversations_count', 0);

    const convertedCount = convertedProfiles?.length || 0;

    // Conversion rate
    const conversionRate = totalTrialsEver && totalTrialsEver > 0
      ? Math.round(convertedCount / totalTrialsEver * 1000) / 10
      : 0;

    // Expired/abandoned trials in period
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: expiredTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .lt('trial_started_at', sevenDaysAgoDate);

    // Average time to conversion (days)
    let avgDaysToConversion = 0;
    if (convertedProfiles && convertedProfiles.length > 0) {
      const totalDays = convertedProfiles.reduce((sum, p) => {
        if (!p.trial_started_at || !p.created_at) return sum;
        const trialStart = new Date(p.trial_started_at).getTime();
        const conversionDate = new Date(p.created_at).getTime();
        const days = Math.max(0, (conversionDate - trialStart) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);
      avgDaysToConversion = Math.round(totalDays / convertedProfiles.length * 10) / 10;
    }

    // Average trial messages for converted vs non-converted
    const avgMsgsConverted = convertedProfiles && convertedProfiles.length > 0
      ? Math.round(convertedProfiles.reduce((sum, p) => sum + (p.trial_conversations_count || 0), 0) / convertedProfiles.length * 10) / 10
      : 0;

    // Trial funnel: responded (1+ msgs) in period
    const { count: trialRespondedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .gte('trial_conversations_count', 1);

    // Trial funnel: value_delivered (Aura entregou valor)
    const { count: trialValueDeliveredCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .in('trial_phase', ['value_delivered', 'aha_reached', 'converting']);

    // Trial funnel: aha_reached (momento de virada)
    const { count: trialAhaCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .in('trial_phase', ['aha_reached', 'converting']);

    // Trial funnel: engaged (20+ msgs) in period
    const { count: trialCompletedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd)
      .gte('trial_conversations_count', 20);

    // Phase distribution for current trials
    const { data: trialPhaseData } = await supabase
      .from('profiles')
      .select('trial_phase')
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null);

    const phaseDistribution: Record<string, number> = {};
    for (const p of trialPhaseData || []) {
      const phase = p.trial_phase || 'listening';
      phaseDistribution[phase] = (phaseDistribution[phase] || 0) + 1;
    }

    // Average aha_at_count for users who reached aha
    const { data: ahaProfiles } = await supabase
      .from('profiles')
      .select('trial_aha_at_count')
      .not('trial_aha_at_count', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd);

    const avgAhaAtCount = ahaProfiles && ahaProfiles.length > 0
      ? Math.round(ahaProfiles.reduce((sum, p) => sum + (p.trial_aha_at_count || 0), 0) / ahaProfiles.length * 10) / 10
      : 0;

    const { data: nonConvertedProfiles } = await supabase
      .from('profiles')
      .select('trial_conversations_count')
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', periodStart)
      .lte('trial_started_at', periodEnd);

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

    return new Response(JSON.stringify({
      // Engagement
      activeUsers: activeUsersInPeriod || 0,
      activeUsersBase: activeUsers || 0,
      weeklyMessages: weeklyMessages || 0,
      weeklySessionsCount,
      avgSessionMinutes,
      messagesPerSession,
      returnRate,
      uniqueRecentUsers,
      avgDailyMessagesPerUser,
      // Trial & Conversion
      activeTrials: activeTrials || 0,
      trialsLast7Days: trialsLast7Days || 0,
      trialsLast30Days: trialsLast30Days || 0,
      totalTrialsEver: totalTrialsEver || 0,
      trialRespondedCount: trialRespondedCount || 0,
      trialCompletedCount: trialCompletedCount || 0,
      convertedCount,
      conversionRate,
      expiredTrials: expiredTrials || 0,
      avgDaysToConversion,
      avgMsgsConverted,
      avgMsgsNonConverted,
      canceledUsers: canceledUsers || 0,
      cancelingUsers: cancelingUsers || 0,
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
