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

    // 4. Average session duration (all completed sessions with both timestamps)
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

    // 5. Messages per session: for each completed session with start/end, count user messages in that window
    const { data: completedSessionsForMsg } = await supabase
      .from('sessions')
      .select('id, user_id, started_at, ended_at')
      .eq('status', 'completed')
      .not('started_at', 'is', null)
      .not('ended_at', 'is', null);

    let messagesPerSession = 0;
    if (completedSessionsForMsg && completedSessionsForMsg.length > 0) {
      let totalSessionMessages = 0;
      for (const session of completedSessionsForMsg) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user_id)
          .eq('role', 'user')
          .gte('created_at', session.started_at!)
          .lte('created_at', session.ended_at!);
        totalSessionMessages += (count || 0);
      }
      messagesPerSession = Math.round(totalSessionMessages / completedSessionsForMsg.length * 10) / 10;
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

    // 7. Average daily messages per user (last 7 days)
    const avgDailyMessagesPerUser = activeUsers && activeUsers > 0
      ? Math.round((weeklyMessages || 0) / 7 / activeUsers * 10) / 10
      : 0;

    return new Response(JSON.stringify({
      activeUsers: activeUsers || 0,
      weeklyMessages: weeklyMessages || 0,
      weeklySessionsCount,
      avgSessionMinutes,
      messagesPerSession,
      returnRate,
      uniqueRecentUsers,
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
