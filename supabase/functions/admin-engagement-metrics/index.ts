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

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ========== ENGAGEMENT METRICS ==========

    // 1. Active users count
    const { count: activeUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // 2. Messages in last 7 days
    const { count: weeklyMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    // 3. Completed sessions in last 7 days
    const { data: weeklySessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('status', 'completed')
      .gte('created_at', sevenDaysAgo);

    const weeklySessionsCount = weeklySessions?.length || 0;

    // 4. Average session duration
    const { data: allCompletedSessions } = await supabase
      .from('sessions')
      .select('started_at, ended_at')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('ended_at', 'is', null);

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
      .not('ended_at', 'is', null);

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

    // 6. Return rate
    const { data: recentUserMessages } = await supabase
      .from('messages')
      .select('user_id')
      .gte('created_at', sevenDaysAgo)
      .eq('role', 'user');

    const uniqueRecentUsers = new Set(recentUserMessages?.map(m => m.user_id) || []).size;
    const returnRate = activeUsers && activeUsers > 0
      ? Math.round(uniqueRecentUsers / activeUsers * 100)
      : 0;

    // 7. Average daily messages per user
    const avgDailyMessagesPerUser = activeUsers && activeUsers > 0
      ? Math.round((weeklyMessages || 0) / 7 / activeUsers * 10) / 10
      : 0;

    // ========== TRIAL & CONVERSION METRICS ==========

    // Active trials
    const { count: activeTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial');

    // Trials started in last 7 days
    const { count: trialsLast7Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', sevenDaysAgo);

    // Trials started in last 30 days
    const { count: trialsLast30Days } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_started_at', thirtyDaysAgo);

    // Total trials ever (anyone who has trial_started_at)
    const { count: totalTrialsEver } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null);

    // Converted: status = active AND trial_started_at is not null
    const { data: convertedProfiles } = await supabase
      .from('profiles')
      .select('trial_started_at, created_at, trial_conversations_count')
      .eq('status', 'active')
      .not('trial_started_at', 'is', null);

    const convertedCount = convertedProfiles?.length || 0;

    // Conversion rate
    const conversionRate = totalTrialsEver && totalTrialsEver > 0
      ? Math.round(convertedCount / totalTrialsEver * 1000) / 10
      : 0;

    // Expired/abandoned trials (status still 'trial' but trial_started_at > 7 days ago)
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: expiredTrials } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial')
      .lt('trial_started_at', sevenDaysAgoDate);

    // Average time to conversion (days)
    let avgDaysToConversion = 0;
    if (convertedProfiles && convertedProfiles.length > 0) {
      const totalDays = convertedProfiles.reduce((sum, p) => {
        if (!p.trial_started_at || !p.created_at) return sum;
        const trialStart = new Date(p.trial_started_at).getTime();
        // Use updated_at would be better but we use created_at of active status
        // Since we can't know exact conversion date, estimate from trial_started_at to now or use a reasonable proxy
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

    // Trial funnel: responded (1+ msgs)
    const { count: trialRespondedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_conversations_count', 1);

    // Trial funnel: completed 5 conversations
    const { count: trialCompletedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('trial_started_at', 'is', null)
      .gte('trial_conversations_count', 5);

    const { data: nonConvertedProfiles } = await supabase
      .from('profiles')
      .select('trial_conversations_count')
      .eq('status', 'trial')
      .not('trial_started_at', 'is', null);

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
      activeUsers: activeUsers || 0,
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
