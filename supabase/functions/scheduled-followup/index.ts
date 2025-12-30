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
    console.log('🔔 Starting scheduled follow-up...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;

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
          user_id
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

        const name = profile.name?.split(' ')[0] || 'você';
        const dueDate = new Date(commitment.due_date);
        const isOverdue = dueDate < today;

        let message = '';
        if (isOverdue) {
          message = `Oi ${name}! 💜\n\nLembrei do seu compromisso: "${commitment.title}"\n\nO prazo era ${dueDate.toLocaleDateString('pt-BR')}, mas tudo bem! Como está a situação? Posso te ajudar a replanejar?`;
        } else {
          message = `Oi ${name}! ✨\n\nPassando pra lembrar do seu compromisso pra hoje: "${commitment.title}"\n\nComo está indo? Me conta se precisar de apoio!`;
        }

        // Send via Z-API
        const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;
        const sendResponse = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Client-Token': zapiClientToken,
            },
            body: JSON.stringify({
              phone: profile.phone,
              message: message,
            }),
          }
        );

        if (sendResponse.ok) {
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
          const error = await sendResponse.text();
          console.error(`❌ Failed to send follow-up: ${error}`);
        }

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 1000));

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
