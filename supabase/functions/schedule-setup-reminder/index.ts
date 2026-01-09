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

    // === FIRST REMINDER: 48-96 hours (2-4 days) ===
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const ninetySixHoursAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

    // === SECOND REMINDER (URGENT): 5-7 days (120-168 hours) ===
    const fiveDaysAgo = new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString();

    let sentCount = 0;
    let errorCount = 0;

    // --- First reminder batch (48-96h) ---
    const { data: firstReminderUsers, error: error1 } = await supabase
      .from('profiles')
      .select('*')
      .eq('needs_schedule_setup', true)
      .in('plan', ['direcao', 'transformacao'])
      .eq('status', 'active')
      .lt('updated_at', fortyEightHoursAgo)
      .gt('updated_at', ninetySixHoursAgo);

    if (error1) {
      console.error('❌ Error fetching first reminder users:', error1);
      throw error1;
    }

    console.log(`📋 First reminder: ${firstReminderUsers?.length || 0} users (48-96h)`);

    for (const user of firstReminderUsers || []) {
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
          console.log(`✅ First reminder sent to ${user.name}`);
          sentCount++;
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
      .lt('updated_at', fiveDaysAgo)
      .gt('updated_at', sevenDaysAgo);

    if (error2) {
      console.error('❌ Error fetching urgent reminder users:', error2);
      throw error2;
    }

    console.log(`🚨 Urgent reminder: ${urgentReminderUsers?.length || 0} users (5-7 days)`);

    for (const user of urgentReminderUsers || []) {
      try {
        const sessionsCount = user.plan === 'transformacao' ? 8 : 4;
        const firstName = user.name?.split(' ')[0] || 'Oi';

        const urgentMessage = `${firstName}, preciso falar com você! ⚠️

Já se passaram 5 dias e suas ${sessionsCount} sessões do mês ainda não foram agendadas.

Essas sessões são parte do seu plano e eu quero muito te ajudar, mas preciso que a gente organize nossa agenda juntas.

Me responde agora: qual dia e horário funciona pra você? Pode ser algo simples como "terças às 20h".

Estou aqui esperando! 💜`;

        const result = await sendTextMessage(user.phone, urgentMessage);
        
        if (result.success) {
          console.log(`🚨 Urgent reminder sent to ${user.name}`);
          sentCount++;
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
    console.log(`✅ Schedule setup reminder complete: ${sentCount} sent, ${errorCount} errors, ${totalUsers} total`);

    return new Response(JSON.stringify({ 
      status: 'success',
      sent: sentCount,
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
