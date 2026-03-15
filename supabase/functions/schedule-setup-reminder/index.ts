import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Schedule Setup Reminder Function
 * 
 * Runs daily at 10h BRT (13h UTC).
 * Reminds users who haven't configured their schedule after checkout.
 * 
 * Safeguards:
 * - Quiet hours: skips if current BRT hour is outside 8h-21h
 * - Dedup: each reminder stage sent at most once per monthly cycle
 * - Safety: skips if DND active, session active, recent interaction, or pending task
 * - Observability: logs sent messages to `messages` table
 */

function getBRTHour(): number {
  const now = new Date();
  // BRT = UTC - 3
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  return brtHour;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ====== QUIET HOURS GUARD ======
    const brtHour = getBRTHour();
    if (brtHour < 8 || brtHour >= 22) {
      console.log(`🌙 Quiet hours active (BRT ${brtHour}h). Skipping all reminders.`);
      return new Response(JSON.stringify({ status: 'skipped', reason: 'quiet_hours', brtHour }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔔 Starting schedule setup reminder check...');

    const today = new Date().toISOString().split('T')[0];
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // ========================================================================
    // REACTIVATION: Users whose pause has expired
    // ========================================================================
    const { data: expiredPauseUsers, error: errorReactivation } = await supabase
      .from('profiles')
      .select('user_id, name, sessions_paused_until')
      .eq('status', 'active')
      .in('plan', ['direcao', 'transformacao'])
      .not('sessions_paused_until', 'is', null)
      .lte('sessions_paused_until', today);

    if (errorReactivation) {
      console.error('❌ Error fetching expired pause users:', errorReactivation);
    } else if (expiredPauseUsers && expiredPauseUsers.length > 0) {
      console.log(`🔄 Reactivating ${expiredPauseUsers.length} users with expired pause`);
      for (const user of expiredPauseUsers) {
        await supabase
          .from('profiles')
          .update({ needs_schedule_setup: true, sessions_paused_until: null })
          .eq('user_id', user.user_id);
        console.log(`🔄 Reactivated ${user.name} (pause was until ${user.sessions_paused_until})`);
      }
    }

    // === FIRST REMINDER: 48-96 hours (2-4 days) ===
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const ninetySixHoursAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

    // === SECOND REMINDER (URGENT): 5-7 days (120-168 hours) ===
    const fiveDaysAgo = new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString();

    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // --- First reminder batch (48-96h) ---
    const { data: firstReminderUsers, error: error1 } = await supabase
      .from('profiles')
      .select('*')
      .eq('needs_schedule_setup', true)
      .in('plan', ['direcao', 'transformacao'])
      .eq('status', 'active')
      .or('sessions_paused_until.is.null,sessions_paused_until.lt.' + today)
      .is('schedule_reminder_first_sent_at', null) // DEDUP: not yet sent
      .lt('updated_at', fortyEightHoursAgo)
      .gt('updated_at', ninetySixHoursAgo);

    if (error1) {
      console.error('❌ Error fetching first reminder users:', error1);
      throw error1;
    }

    console.log(`📋 First reminder: ${firstReminderUsers?.length || 0} users (48-96h)`);

    for (const user of firstReminderUsers || []) {
      try {
        // ====== SAFETY FILTERS ======
        const skipReason = await shouldSkipUser(supabase, user, twoHoursAgo);
        if (skipReason) {
          console.log(`⏭️ Skipping ${user.name} (first reminder): ${skipReason}`);
          skippedCount++;
          continue;
        }

        const sessionsCount = user.plan === 'transformacao' ? 8 : 4;
        const firstName = user.name?.split(' ')[0] || 'Oi';

        const message = `${firstName}, tudo bem? 💜

Percebi que a gente ainda não organizou suas ${sessionsCount} sessões do mês!

Quer fazer isso agora? Me conta quais dias e horários funcionam melhor pra você.

Por exemplo: "segundas e quintas às 19h" ou "quartas às 20h"

Fico esperando! 🌟`;

        const result = await sendTextMessage(user.phone, message);
        
        if (result.success) {
          console.log(`✅ First reminder sent to ${user.name}`);
          sentCount++;

          // Mark as sent (DEDUP)
          await supabase
            .from('profiles')
            .update({ schedule_reminder_first_sent_at: new Date().toISOString() })
            .eq('user_id', user.user_id);

          // Log to messages for audit
          await supabase.from('messages').insert({
            user_id: user.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          console.error(`❌ Failed to send first reminder to ${user.name}:`, result.error);
          errorCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (userError) {
        console.error(`❌ Error processing user ${user.user_id}:`, userError);
        errorCount++;
      }
    }

    // --- Second reminder batch (5-7 days) - URGENT ---
    const { data: urgentReminderUsers, error: error2 } = await supabase
      .from('profiles')
      .select('*')
      .eq('needs_schedule_setup', true)
      .in('plan', ['direcao', 'transformacao'])
      .eq('status', 'active')
      .or('sessions_paused_until.is.null,sessions_paused_until.lt.' + today)
      .is('schedule_reminder_urgent_sent_at', null) // DEDUP: not yet sent
      .lt('updated_at', fiveDaysAgo)
      .gt('updated_at', sevenDaysAgo);

    if (error2) {
      console.error('❌ Error fetching urgent reminder users:', error2);
      throw error2;
    }

    console.log(`🚨 Urgent reminder: ${urgentReminderUsers?.length || 0} users (5-7 days)`);

    for (const user of urgentReminderUsers || []) {
      try {
        // ====== SAFETY FILTERS ======
        const skipReason = await shouldSkipUser(supabase, user, twoHoursAgo);
        if (skipReason) {
          console.log(`⏭️ Skipping ${user.name} (urgent reminder): ${skipReason}`);
          skippedCount++;
          continue;
        }

        const sessionsCount = user.plan === 'transformacao' ? 8 : 4;
        const firstName = user.name?.split(' ')[0] || 'Oi';

        const urgentMessage = `${firstName}, preciso falar com você! ⚠️

Já se passaram 5 dias e suas ${sessionsCount} sessões do mês ainda não foram agendadas.

Essas sessões são parte do seu plano e eu quero muito te ajudar, mas preciso que a gente organize nossa agenda.

Me responde agora: qual dia e horário funciona pra você? Pode ser algo simples como "terças às 20h".

Estou aqui esperando! 💜`;

        const result = await sendTextMessage(user.phone, urgentMessage);
        
        if (result.success) {
          console.log(`🚨 Urgent reminder sent to ${user.name}`);
          sentCount++;

          // Mark as sent (DEDUP)
          await supabase
            .from('profiles')
            .update({ schedule_reminder_urgent_sent_at: new Date().toISOString() })
            .eq('user_id', user.user_id);

          // Log to messages for audit
          await supabase.from('messages').insert({
            user_id: user.user_id,
            role: 'assistant',
            content: urgentMessage,
          });
        } else {
          console.error(`❌ Failed to send urgent reminder to ${user.name}:`, result.error);
          errorCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (userError) {
        console.error(`❌ Error processing user ${user.user_id}:`, userError);
        errorCount++;
      }
    }

    const totalUsers = (firstReminderUsers?.length || 0) + (urgentReminderUsers?.length || 0);
    console.log(`✅ Schedule setup reminder complete: ${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors, ${totalUsers} total`);

    return new Response(JSON.stringify({ 
      status: 'success',
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      total: totalUsers
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Schedule setup reminder error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process reminders',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Safety filters: returns a skip reason string if user should be skipped, null otherwise.
 */
async function shouldSkipUser(
  supabase: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  twoHoursAgo: string
): Promise<string | null> {
  // 1. DND active
  if (user.do_not_disturb_until) {
    const dndUntil = new Date(user.do_not_disturb_until as string);
    if (dndUntil > new Date()) {
      return 'DND active';
    }
  }

  // 2. Active session
  if (user.current_session_id) {
    return 'active session';
  }

  // 3. Recent interaction (any message in last 2h)
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('id')
    .eq('user_id', user.user_id)
    .gte('created_at', twoHoursAgo)
    .limit(1);

  if (recentMessages && recentMessages.length > 0) {
    return 'recent interaction (<2h)';
  }

  // 4. Pending scheduled task
  const { data: pendingTasks } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('user_id', user.user_id)
    .eq('status', 'pending')
    .limit(1);

  if (pendingTasks && pendingTasks.length > 0) {
    return 'pending scheduled task';
  }

  return null;
}
