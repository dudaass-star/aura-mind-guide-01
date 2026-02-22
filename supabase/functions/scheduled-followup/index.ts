import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔔 Starting scheduled follow-up...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get commitments that are due today or overdue and haven't been reminded
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: commitments, error: commitmentsError } = await supabase
      .from('commitments')
      .select(`
        *,
        profiles!commitments_user_id_fkey (
          name,
          phone,
          user_id,
          do_not_disturb_until,
          whatsapp_instance_id
        )
      `)
      .eq('completed', false)
      .eq('reminder_sent', false)
      .lte('due_date', tomorrow.toISOString());

    if (commitmentsError) {
      throw new Error(`Error fetching commitments: ${commitmentsError.message}`);
    }

    console.log(`📋 Found ${commitments?.length || 0} commitments needing follow-up`);

    let sentCount = 0;

    for (const commitment of commitments || []) {
      try {
        const profile = commitment.profiles;
        if (!profile?.phone) {
          console.log(`⏭️ Skipping commitment ${commitment.id}: no phone`);
          continue;
        }

        // Skip if do_not_disturb is active
        if (profile.do_not_disturb_until && new Date(profile.do_not_disturb_until) > new Date()) {
          console.log(`🔇 Skipping commitment ${commitment.id} - do not disturb until ${profile.do_not_disturb_until}`);
          continue;
        }

        const name = profile.name?.split(' ')[0] || 'você';
        const dueDate = new Date(commitment.due_date);
        const isOverdue = dueDate < today;

        // Atualizar contador de follow-ups
        const newFollowUpCount = (commitment.follow_up_count || 0) + 1;
        
        let message = '';
        if (isOverdue) {
          if (newFollowUpCount === 1) {
            message = `Oi ${name}! 💜\n\nLembrei do seu compromisso: "${commitment.title}"\n\nO prazo era ${dueDate.toLocaleDateString('pt-BR')}, mas tudo bem! Como está a situação? Me conta o que rolou!`;
          } else if (newFollowUpCount === 2) {
            message = `Ei ${name}! 🤗\n\nPassando de novo sobre: "${commitment.title}"\n\nVi que ainda não fechou. Tá difícil? A gente pode ajustar o plano se precisar!`;
          } else {
            message = `${name}, olha só... 💜\n\nSobre "${commitment.title}" - vamos ser honestas: esse compromisso ainda faz sentido pra você?\n\nSe sim, vamos replanejar juntas. Se não, tudo bem soltar! O importante é você estar em paz. Me conta!`;
          }
        } else {
          message = `Oi ${name}! ✨\n\nHoje é dia do seu compromisso: "${commitment.title}"\n\nComo está indo? Me manda um "fiz!" quando completar! 🎯`;
        }
        
        // Atualizar contador
        await supabase
          .from('commitments')
          .update({ follow_up_count: newFollowUpCount })
          .eq('id', commitment.id);

        // Get instance config for this user
        const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);

        const cleanPhone = cleanPhoneNumber(profile.phone);
        const result = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);

        if (result.success) {
          console.log(`✅ Follow-up sent for commitment: ${commitment.title}`);
          sentCount++;

          // Mark as reminded
          await supabase
            .from('commitments')
            .update({ reminder_sent: true })
            .eq('id', commitment.id);

          // Save message to history
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          console.error(`❌ Failed to send follow-up: ${result.error}`);
        }

        // Per-instance anti-burst delay
        await antiBurstDelayForInstance(profile?.whatsapp_instance_id || 'default');

      } catch (commitmentError) {
        console.error(`❌ Error processing commitment ${commitment.id}:`, commitmentError);
      }
    }

    console.log(`📊 Follow-up complete: ${sentCount}/${commitments?.length || 0} reminders sent`);

    return new Response(JSON.stringify({ 
      status: 'success', 
      totalCommitments: commitments?.length || 0,
      remindersSent: sentCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Scheduled follow-up error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
