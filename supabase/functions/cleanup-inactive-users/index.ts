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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const stats = {
      ghost_trials: 0,
      expired_trials: 0,
      old_canceled: 0,
      total: 0,
      errors: [] as string[],
    };

    // ── 1. Ghost trials: never interacted + >7 days since trial_started_at ──
    const ghostCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: ghostTrials, error: ghostErr } = await supabase
      .from('profiles')
      .select('user_id, name, phone, whatsapp_instance_id, trial_started_at')
      .eq('status', 'trial')
      .is('last_message_date', null)
      .lt('trial_started_at', ghostCutoff);

    if (ghostErr) {
      stats.errors.push(`ghost_trials query: ${ghostErr.message}`);
    } else if (ghostTrials && ghostTrials.length > 0) {
      console.log(`🔍 Ghost trials eligible: ${ghostTrials.length}`);
      for (const profile of ghostTrials) {
        console.log(`🗑️ Deleting ghost trial: ${profile.name} (${profile.phone}) — started ${profile.trial_started_at}`);
        const { error: delErr } = await supabase
          .from('profiles')
          .delete()
          .eq('user_id', profile.user_id);
        if (delErr) {
          stats.errors.push(`delete ghost trial ${profile.user_id}: ${delErr.message}`);
        } else {
          stats.ghost_trials++;
          stats.total++;
        }
      }
    }

    // ── 2. Expired trials: last message >30 days ago ──
    const expiredCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredTrials, error: expiredErr } = await supabase
      .from('profiles')
      .select('user_id, name, phone, last_message_date')
      .eq('status', 'trial')
      .not('last_message_date', 'is', null)
      .lt('last_message_date', expiredCutoff);

    if (expiredErr) {
      stats.errors.push(`expired_trials query: ${expiredErr.message}`);
    } else if (expiredTrials && expiredTrials.length > 0) {
      console.log(`🔍 Expired trials eligible: ${expiredTrials.length}`);
      for (const profile of expiredTrials) {
        console.log(`🗑️ Deleting expired trial: ${profile.name} (${profile.phone}) — last msg ${profile.last_message_date}`);
        const { error: delErr } = await supabase
          .from('profiles')
          .delete()
          .eq('user_id', profile.user_id);
        if (delErr) {
          stats.errors.push(`delete expired trial ${profile.user_id}: ${delErr.message}`);
        } else {
          stats.expired_trials++;
          stats.total++;
        }
      }
    }

    // ── 3. Old canceled: last message >60 days ago ──
    const canceledCutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldCanceled, error: canceledErr } = await supabase
      .from('profiles')
      .select('user_id, name, phone, last_message_date')
      .eq('status', 'canceled')
      .lt('last_message_date', canceledCutoff);

    if (canceledErr) {
      stats.errors.push(`old_canceled query: ${canceledErr.message}`);
    } else if (oldCanceled && oldCanceled.length > 0) {
      console.log(`🔍 Old canceled eligible: ${oldCanceled.length}`);
      for (const profile of oldCanceled) {
        console.log(`🗑️ Deleting old canceled: ${profile.name} (${profile.phone}) — last msg ${profile.last_message_date}`);
        const { error: delErr } = await supabase
          .from('profiles')
          .delete()
          .eq('user_id', profile.user_id);
        if (delErr) {
          stats.errors.push(`delete old canceled ${profile.user_id}: ${delErr.message}`);
        } else {
          stats.old_canceled++;
          stats.total++;
        }
      }
    }

    console.log(`✅ Cleanup complete. Total deleted: ${stats.total}`, stats);

    return new Response(JSON.stringify({
      success: true,
      deleted: stats.total,
      breakdown: {
        ghost_trials: stats.ghost_trials,
        expired_trials: stats.expired_trials,
        old_canceled: stats.old_canceled,
      },
      errors: stats.errors,
      ran_at: now.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
