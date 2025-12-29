import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check-in message templates based on context
function getCheckinMessage(profile: any, lastCheckin: any, pendingCommitments: any[]): string {
  const name = profile.name?.split(' ')[0] || 'você';
  const hour = new Date().getHours();
  
  let greeting = '';
  if (hour < 12) greeting = 'Bom dia';
  else if (hour < 18) greeting = 'Boa tarde';
  else greeting = 'Boa noite';

  // If has pending commitments, mention them
  if (pendingCommitments.length > 0) {
    const commitment = pendingCommitments[0];
    return `${greeting}, ${name}! 💫\n\nLembrei de você e do seu compromisso: "${commitment.title}"\n\nComo está indo com isso? Me conta como posso te ajudar hoje.`;
  }

  // If had recent check-in with low mood/energy
  if (lastCheckin) {
    if (lastCheckin.mood && lastCheckin.mood < 5) {
      return `${greeting}, ${name}! 💜\n\nOntem percebi que você não estava se sentindo tão bem. Como você está hoje? Estou aqui pra te ouvir.`;
    }
    if (lastCheckin.energy && lastCheckin.energy < 5) {
      return `${greeting}, ${name}! ✨\n\nVi que sua energia estava baixa ontem. Conseguiu descansar? Como está se sentindo agora?`;
    }
  }

  // Default check-in messages (random selection)
  const defaultMessages = [
    `${greeting}, ${name}! 🌟\n\nComo você está começando o dia? Estou aqui pra te ouvir e te ajudar em qualquer coisa.`,
    `${greeting}, ${name}! 💫\n\nPassei pra saber como você está. Tem algo na sua mente hoje?`,
    `${greeting}, ${name}! 🌸\n\nEstou aqui pensando em você. Como está seu dia? Posso te ajudar com algo?`,
    `${greeting}, ${name}! ✨\n\nQueria saber como você está se sentindo. Vamos conversar?`,
  ];

  return defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🕐 Starting scheduled check-in...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;

    // Get active users with phone numbers
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null);

    if (profilesError) {
      throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    console.log(`📋 Found ${profiles?.length || 0} active users`);

    let sentCount = 0;

    for (const profile of profiles || []) {
      try {
        // Get last check-in
        const { data: lastCheckin } = await supabase
          .from('checkins')
          .select('*')
          .eq('user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get pending commitments
        const { data: pendingCommitments } = await supabase
          .from('commitments')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('completed', false)
          .order('due_date', { ascending: true });

        // Compose personalized message
        const message = getCheckinMessage(profile, lastCheckin, pendingCommitments || []);

        // Send via Z-API
        const sendResponse = await fetch(
          `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: profile.phone,
              message: message,
            }),
          }
        );

        if (sendResponse.ok) {
          console.log(`✅ Check-in sent to ${profile.name} (${profile.phone})`);
          sentCount++;

          // Save message to history
          await supabase.from('messages').insert({
            user_id: profile.user_id,
            role: 'assistant',
            content: message,
          });
        } else {
          const error = await sendResponse.text();
          console.error(`❌ Failed to send to ${profile.phone}: ${error}`);
        }

        // Small delay between sends to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (userError) {
        console.error(`❌ Error processing user ${profile.user_id}:`, userError);
      }
    }

    console.log(`📊 Check-in complete: ${sentCount}/${profiles?.length || 0} messages sent`);

    return new Response(JSON.stringify({ 
      status: 'success', 
      totalUsers: profiles?.length || 0,
      messagesSent: sentCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Scheduled check-in error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
