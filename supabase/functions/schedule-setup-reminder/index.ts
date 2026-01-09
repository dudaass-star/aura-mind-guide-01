import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage } from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Schedule Setup Reminder Function
 * 
 * Runs every 6 hours to remind users who haven't configured their schedule
 * 48+ hours after checkout.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔔 Starting schedule setup reminder check...');

    // Calculate 48 hours ago
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    
    // Calculate 96 hours ago (4 days) - don't remind users older than this to avoid spam
    const ninetysixHoursAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

    // Fetch users who:
    // 1. Have needs_schedule_setup = true
    // 2. Have a plan with sessions (direcao or transformacao)
    // 3. Are active
    // 4. Were created/updated between 48-96 hours ago
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('needs_schedule_setup', true)
      .in('plan', ['direcao', 'transformacao'])
      .eq('status', 'active')
      .lt('updated_at', fortyEightHoursAgo)
      .gt('updated_at', ninetysixHoursAgo);

    if (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }

    console.log(`📋 Found ${users?.length || 0} users needing schedule setup reminder`);

    let sentCount = 0;
    let errorCount = 0;

    for (const user of users || []) {
      try {
        const sessionsCount = user.plan === 'transformacao' ? 8 : 4;
        const firstName = user.name?.split(' ')[0] || 'Oi';

        const message = `${firstName}, tudo bem? 💜

Percebi que a gente ainda não organizou suas ${sessionsCount} sessões do mês!

Quer fazer isso agora? Me conta quais dias e horários funcionam melhor pra você.

Por exemplo: "segundas e quintas às 19h" ou "quartas às 20h"

Fico esperando! 🌟`;

        const result = await sendTextMessage(user.phone, message);
        
        if (result.success) {
          console.log(`✅ Reminder sent to ${user.name}`);
          sentCount++;
        } else {
          console.error(`❌ Failed to send reminder to ${user.name}:`, result.error);
          errorCount++;
        }

        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (userError) {
        console.error(`❌ Error processing user ${user.user_id}:`, userError);
        errorCount++;
      }
    }

    console.log(`✅ Schedule setup reminder complete: ${sentCount} sent, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      status: 'success',
      sent: sentCount,
      errors: errorCount,
      total: users?.length || 0
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
