import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Monthly Schedule Renewal Function
 * 
 * Runs on the 1st of each month at 10h São Paulo (13h UTC)
 * Resets session counters and prompts users to schedule their monthly sessions
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🗓️ Starting monthly schedule renewal process...');

    // Fetch active users with plans that include sessions
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .in('plan', ['direcao', 'transformacao'])
      .eq('status', 'active');

    if (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }

    console.log(`📋 Processing ${users?.length || 0} users for monthly schedule renewal`);

    const monthNames = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const currentMonth = monthNames[new Date().getMonth()];
    const today = new Date().toISOString().split('T')[0];

    let processedCount = 0;
    let errorCount = 0;

    for (const user of users || []) {
      try {
        const sessionsCount = user.plan === 'transformacao' ? 8 : 4;

        // Reset session counter and trigger schedule setup
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            sessions_used_this_month: 0,
            sessions_reset_date: today,
            needs_schedule_setup: true,
            sessions_paused_until: null,
            schedule_reminder_first_sent_at: null,
            schedule_reminder_urgent_sent_at: null,
            audio_seconds_used_this_month: 0,
            audio_reset_date: today,
          })
          .eq('user_id', user.user_id);

        if (updateError) {
          console.error(`❌ Error updating profile for ${user.name}:`, updateError);
          errorCount++;
          continue;
        }

        // Send message prompting schedule setup
        const message = `Oi, ${user.name}! 🌟

Começamos ${currentMonth} e suas ${sessionsCount} sessões do mês estão disponíveis!

Me conta: quais dias e horários funcionam pra você esse mês?

Por exemplo: "segundas e quintas às 19h" ou "quartas às 20h"`;

        const result = await sendProactive(user.phone, message, 'checkin', user.user_id);
        
        if (result.success) {
          console.log(`✅ Monthly renewal message sent to ${user.name}`);
          processedCount++;
        } else {
          console.error(`❌ Failed to send message to ${user.name}:`, result.error);
          errorCount++;
        }

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (userError) {
        console.error(`❌ Error processing user ${user.user_id}:`, userError);
        errorCount++;
      }
    }

    console.log(`✅ Monthly renewal complete: ${processedCount} processed, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      status: 'success',
      processed: processedCount,
      errors: errorCount,
      total: users?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Monthly schedule renewal error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process monthly renewals',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
