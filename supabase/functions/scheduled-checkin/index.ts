import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, antiBurstDelayForInstance, groupByInstance } from "../_shared/instance-helper.ts";

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

  if (pendingCommitments.length > 0) {
    const commitment = pendingCommitments[0];
    return `${greeting}, ${name}! 💫\n\nLembrei de você e do seu compromisso: "${commitment.title}"\n\nComo está indo com isso? Me conta como posso te ajudar hoje.`;
  }

  if (lastCheckin) {
    if (lastCheckin.mood && lastCheckin.mood < 5) {
      return `${greeting}, ${name}! 💜\n\nOntem percebi que você não estava se sentindo tão bem. Como você está hoje? Estou aqui pra te ouvir.`;
    }
    if (lastCheckin.energy && lastCheckin.energy < 5) {
      return `${greeting}, ${name}! ✨\n\nVi que sua energia estava baixa ontem. Conseguiu descansar? Como está se sentindo agora?`;
    }
  }

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
    let dryRun = false;
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      targetUserId = body?.target_user_id || null;
    } catch { /* no body */ }

    console.log(`🕐 Starting scheduled check-in... (dry_run=${dryRun})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get active users with phone numbers
    let profilesQuery = supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .not('phone', 'is', null);

    if (targetUserId) {
      profilesQuery = profilesQuery.eq('user_id', targetUserId);
    } else {
      profilesQuery = profilesQuery.or('do_not_disturb_until.is.null,do_not_disturb_until.lte.' + new Date().toISOString());
    }

    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    console.log(`📋 Found ${profiles?.length || 0} active users`);

    let sentCount = 0;
    const dryRunResults: any[] = [];

    // Group by WhatsApp instance for parallel processing
    const instanceGroups = groupByInstance(profiles || []);

    await Promise.all(
      Array.from(instanceGroups.entries()).map(async ([instanceId, groupProfiles]) => {
        for (const profile of groupProfiles) {
          try {
            const { data: lastCheckin } = await supabase
              .from('checkins')
              .select('*')
              .eq('user_id', profile.user_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            const { data: pendingCommitments } = await supabase
              .from('commitments')
              .select('*')
              .eq('user_id', profile.user_id)
              .eq('completed', false)
              .order('due_date', { ascending: true });

            const message = getCheckinMessage(profile, lastCheckin, pendingCommitments || []);

            if (dryRun) {
              dryRunResults.push({
                user_id: profile.user_id,
                name: profile.name,
                message,
              });
              sentCount++;
              continue;
            }

            // Get instance config for this user
            const zapiConfig = await getInstanceConfigForUser(supabase, profile.user_id);

            const cleanPhone = cleanPhoneNumber(profile.phone);
            const result = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);

            if (result.success) {
              console.log(`✅ Check-in sent to ${profile.name} (${profile.phone})`);
              sentCount++;

              await supabase.from('messages').insert({
                user_id: profile.user_id,
                role: 'assistant',
                content: message,
              });
            } else {
              console.error(`❌ Failed to send to ${profile.phone}: ${result.error}`);
            }

            // Per-instance anti-burst delay
            await antiBurstDelayForInstance(instanceId);

          } catch (userError) {
            console.error(`❌ Error processing user ${profile.user_id}:`, userError);
          }
        }
      })
    );

    console.log(`📊 Check-in complete: ${sentCount}/${profiles?.length || 0} messages sent`);

    const responsePayload: any = { 
      status: 'success', 
      totalUsers: profiles?.length || 0,
      messagesSent: sentCount,
    };
    if (dryRun) {
      responsePayload.dry_run = true;
      responsePayload.messages = dryRunResults;
    }

    return new Response(JSON.stringify(responsePayload), {
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
